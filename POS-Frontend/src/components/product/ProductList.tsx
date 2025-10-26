import React, { useState, useEffect } from "react";
import { jwtDecode } from "jwt-decode";

// 🧩 Components
import SearchFilter from "./SearchFilter";
import ProductGrid from "./ProductGrid";
import CartSidebar from "./CartSidebar";
import NumberPad from "./NumberPad";
import StockErrorDialog from "./StockErrorDialog";
import Checkout from "../payment/Checkout";
import { Product, StockItem, Category } from "../../types/productTypes";
import ReceiptModal from "../receipt/ReceiptModal"; 

// 🧠 APIs
import { getProducts } from "../../api/product/productApi";
import { getStockData, createOrder } from "../../api/stock/stock";
import { createPayment } from "../../api/payment/paymentApi";
import { getCategories } from "../../api/product/categoryApi";

// 🎨 Styles
import "../../styles/product/ProductList.css";

interface CartProps {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

const ProductList: React.FC<CartProps> = ({ isSidebarOpen }) => {
  // ======================= States =======================
  const [user, setUser] = useState<{ userId: string; username: string; role: string; email: string } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Product[]>([]);
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [popupVisible, setPopupVisible] = useState(false);
  const [errorType, setErrorType] = useState<"outOfStock" | "notFound">("outOfStock");

  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<any | null>(null);

  // Search + Filter
  const [searchProduct, setSearchProduct] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  // NumberPad
  const [showNumberPad, setShowNumberPad] = useState(false);
  const [selectedProductBarcode, setSelectedProductBarcode] = useState("");
  const [currentQuantity, setCurrentQuantity] = useState("1");
  const [numpadErrorMessage, setNumpadErrorMessage] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Checkout
  const [showCheckout, setShowCheckout] = useState(false);
  const [showStockError, setShowStockError] = useState(false);

  // ======================= Effects =======================
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const decoded: any = jwtDecode(token);
        setUser({
          userId: decoded.userId,
          username: decoded.username,
          role: decoded.role,
          email: decoded.email,
        });
      } catch (err) {
        console.error("Invalid token:", err);
      }
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const wrapper = document.querySelector(".search-wrapper");
      if (window.scrollY > 20) wrapper?.classList.add("scrolled");
      else wrapper?.classList.remove("scrolled");
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const fetchAllData = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;

      try {
        // 🧱 STEP 1: โหลด Stock ก่อน (เก็บทั้ง stock._id + product._id + ราคา)
        const stock = await getStockData(token);

        const mappedStock: StockItem[] = (stock || []).map((item: any) => ({
          _id: item._id,                  // ✅ เก็บ id ของ Stock
          barcode: item.barcode,
          isActive: item.isActive === true, // ป้องกัน undefined
          totalQuantity: Number(item.totalQuantity ?? 0),
          status: item.status || "",
          supplier: item.supplier || item.supplierId?.companyName || "",
          costPrice: Number(item.costPrice ?? item.productId?.costPrice ?? 0),
          salePrice: Number(item.salePrice ?? item.productId?.price ?? 0),
          productId: {
            _id: item.productId?._id,
            isActive: item.productId?.isActive ?? item.isActive ?? true,
            name: item.productId?.name || "",
            price: Number(item.salePrice ?? item.productId?.price ?? 0),
            barcode: item.productId?.barcode || item.barcode || "",
            imageUrl: item.productId?.imageUrl || "",
            category: {
              _id: item.productId?.category?._id,
              name: item.productId?.category?.name || "",
            },
          },
        }));

        setStockData(mappedStock);

        // 🧱 STEP 2: โหลด Products แล้ว match กับ stock (เพื่อให้ product มีราคา/สต็อกจริง)
        const res = await getProducts();
        if (res?.success && Array.isArray(res.data)) {
          const mappedProducts: Product[] = res.data
            .map((item: any) => {
              const p = item.productId || {};
              const stockItem = mappedStock.find((s) => s.productId?._id === p._id);

              return {
                _id: p._id,
                stockId: stockItem?._id,
                barcode: p.barcode || item.barcode || "",
                name: p.name || "",
                isActive: item.isActive ?? true,
                price: stockItem?.salePrice ?? Number(p.salePrice ?? p.price ?? 0),
                costPrice: stockItem?.costPrice ?? Number(p.costPrice ?? 0),
                totalQuantity: Number(stockItem?.totalQuantity ?? item.totalQuantity ?? 0),
                category: {
                  _id: p.category?._id || "",
                  name: p.category?.name || "",
                },
                imageUrl: p.imageUrl || "",
              } as Product;
            })
            // ✅ แสดงเฉพาะที่ “ขายได้จริง”
            .filter((prod: { totalQuantity: any; isActive: boolean; }) =>
              (prod.totalQuantity ?? 0) > 0 &&
              prod.isActive !== false
            );

          setProducts(mappedProducts);

          // ดีบักชั่วคราว
          console.log("stocks available:", mappedStock.length);
          console.log("products mapped:", mappedProducts.length);
        } else {
          setErrorMessage("ไม่พบข้อมูลสินค้า");
        }

        // 🧱 STEP 3: โหลด Category
        const categoryRes = await getCategories(token);
        if (categoryRes?.success && Array.isArray(categoryRes.data)) {
          setCategories(categoryRes.data);
        }
      } catch (err) {
        console.error("❌ โหลดข้อมูลล้มเหลว:", err);
        setErrorMessage("เกิดข้อผิดพลาดในการโหลดข้อมูล");
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, []);

  // ======================= Handlers =======================
  const addToCart = (product: Product) => {
    const productStock = stockData.find((item) => item.barcode === product.barcode);
    const currentCartItem = cart.find((item) => item.barcode === product.barcode);
    const currentQtyInCart = currentCartItem ? currentCartItem.totalQuantity : 0;

    if (productStock && currentQtyInCart + 1 > (productStock.totalQuantity ?? 0)) {
      setShowStockError(true);
      setErrorType("outOfStock");
      return;
    }

    setCart((prevCart) => {
      const existingProduct = prevCart.find((item) => item.barcode === product.barcode);
      if (existingProduct) {
        return prevCart.map((item) =>
          item.barcode === product.barcode
            ? { ...item, totalQuantity: item.totalQuantity + 1 }
            : item
        );
      }
      return [...prevCart, { ...product, totalQuantity: 1 }];
    });
  };

  const removeFromCart = (_item: Product, barcode: string) =>
    setCart((prev) => prev.filter((i) => i.barcode !== barcode));

  const clearCart = () => setCart([]);

  const handleProductNotFound = () => {
    setErrorType("notFound");
    setShowStockError(true);
  };

  const openNumberPad = (initialQty: number, barcode: string) => {
    setSelectedProductBarcode(barcode);
    setCurrentQuantity(initialQty.toString());
    setErrorMessage("");
    setIsEditing(false);
    setShowNumberPad(true);
    setNumpadErrorMessage("");
  };

  const handleQuantityChange = (value: string) => {
    setErrorMessage("");
    setCurrentQuantity((prev) => {
      if (!isEditing || prev === "0") {
        setIsEditing(true);
        return value;
      } else {
        return prev + value;
      }
    });
  };

  const handleDeleteOne = () => setCurrentQuantity((prev) => prev.slice(0, -1) || "0");
  const handleClear = () => setCurrentQuantity("0");

  const handleSetQuantity = () => {
    const value = parseInt(currentQuantity, 10);
    if (isNaN(value) || value <= 0) return;

    const stock = stockData.find((s) => s.barcode === selectedProductBarcode);
    if (stock && value > (stock.totalQuantity ?? 0)) {
      setNumpadErrorMessage("❌ สินค้าในคลังไม่พอ");
      return;
    }

    setCart((prev) =>
      prev.map((i) =>
        i.barcode === selectedProductBarcode ? { ...i, totalQuantity: value } : i
      )
    );
    setShowNumberPad(false);
  };

  const getTotalPrice = () =>
    cart.reduce((sum, i) => sum + Number(i.price ?? 0) * Number(i.totalQuantity ?? 0), 0);

  const checkout = async (
    amountReceived: number,
    method: "เงินสด" | "โอนเงิน" | "บัตรเครดิต" | "QR Code",
    discountAmount: number = 0
  ) => {
    if (!user) {
      setErrorMessage("กรุณาเข้าสู่ระบบก่อนทำรายการ");
      return;
    }

    const finalTotal = Math.max(getTotalPrice() - discountAmount, 0);

    const orderData = {
      saleId: new Date().getTime().toString(),
      userId: user.userId,
      source: "POS",
      items: cart.map((i) => ({
        productId: i._id,             // ✅ สำคัญ: product._id จริง (ใช้ตัดล็อต FEFO)
        stockId: i.stockId || null,   // optional เผื่อ debug/ตรวจสอบ
        barcode: i.barcode,
        name: i.name,
        price: i.price,
        costPrice: i.costPrice ?? undefined, // optional (ช่วยให้บันทึกธุรกรรมได้ครบ)
        quantity: i.totalQuantity,
        subtotal: Number(i.price ?? 0) * Number(i.totalQuantity ?? 0),
      })),
      paymentMethod: method,
      amount: finalTotal,
      amountReceived,
      change: amountReceived - finalTotal,
      discount: discountAmount,
    };

    try {
      const orderRes = await createOrder(orderData);
      if (!orderRes.success) throw new Error(orderRes.message);

      const paymentRes = await createPayment({
        saleId: orderData.saleId,
        employeeName: user.username,
        paymentMethod: method,
        amount: finalTotal,
        amountReceived,
        change: amountReceived - finalTotal,
        discount: discountAmount,
        items: orderData.items,
      });

      if (!paymentRes.success) throw new Error(paymentRes.message);

      // ✅ เก็บข้อมูลใบเสร็จไว้แสดงหลังจาก popup ปิด
      setReceiptData({
        paymentId: {
          saleId: orderData.saleId,
          paymentMethod: method,
          createdAt: new Date().toISOString(),
        },
        employeeName: user.username,
        totalPrice: finalTotal,
        discount: discountAmount,
        amountPaid: amountReceived,
        changeAmount: amountReceived - finalTotal,
        timestamp: new Date().toISOString(),
        items: orderData.items,
      });


      setPopupVisible(true);
      setCart([]);
      setTimeout(() => setShowCheckout(false), 200);
    } catch (err) {
      setErrorMessage("💥 เกิดข้อผิดพลาดในการชำระเงิน");
      console.error(err);
    }
  };

  // ======================= Filter =======================
  const filteredProducts = products.filter((p) => {
    const matchName = (p.name || "").toLowerCase().includes(searchProduct.toLowerCase());
    const matchCategory = !categoryFilter || p.category._id === categoryFilter;
    return matchName && matchCategory;
  });

  // ======================= Render =======================
  return (
    <div className="display">
      <div className="pos-page">
        <div className="pos-search-bar">
          <div className="search-wrapper">
            <SearchFilter
              searchProduct={searchProduct}
              setSearchProduct={setSearchProduct}
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              isSidebarOpen={isSidebarOpen}
              products={products}
              addToCart={addToCart}
              onProductNotFound={handleProductNotFound}
            />
          </div>

          <div className="pos-main-content">
            <div className="pos-product-area">
              <ProductGrid
                products={products}
                filteredProducts={filteredProducts}
                cart={cart}
                addToCart={addToCart}
                errorMessage={errorMessage}
                loading={loading}
                searchProduct={searchProduct}
                categoryFilter={categoryFilter}
              />
            </div>

            <div className="pos-cart-area">
              {/* 🏪 หัวของตะกร้า */}
              <div className="cart-header">
                <h1 className="cart-store-title">EAZY POS</h1>
                <p className="cart-store-subtitle">ระบบขายหน้าร้านอัจฉริยะ</p>
              </div>

              {/* 🛒 เนื้อหาตะกร้า */}
              {cart.length > 0 ? (
                <CartSidebar
                  cart={cart}
                  isSidebarOpen={isSidebarOpen}
                  clearCart={clearCart}
                  removeFromCart={removeFromCart}
                  openNumberPad={openNumberPad}
                  getTotalPrice={getTotalPrice}
                  setShowCheckout={setShowCheckout}
                />
              ) : (
                <div className="cart-empty">
                    <svg fill="#000000" height="50px" width="5  0px" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 231.523 231.523">
                    <g>
                      <path d="M107.415,145.798c0.399,3.858,3.656,6.73,7.451,6.73c0.258,0,0.518-0.013,0.78-0.04c4.12-0.426,7.115-4.111,6.689-8.231
                        l-3.459-33.468c-0.426-4.12-4.113-7.111-8.231-6.689c-4.12,0.426-7.115,4.111-6.689,8.231L107.415,145.798z"/>
                      <path d="M154.351,152.488c0.262,0.027,0.522,0.04,0.78,0.04c3.796,0,7.052-2.872,7.451-6.73l3.458-33.468
                        c0.426-4.121-2.569-7.806-6.689-8.231c-4.123-0.421-7.806,2.57-8.232,6.689l-3.458,33.468
                        C147.235,148.377,150.23,152.062,154.351,152.488z"/>
                      <path d="M96.278,185.088c-12.801,0-23.215,10.414-23.215,23.215c0,12.804,10.414,23.221,23.215,23.221
                        c12.801,0,23.216-10.417,23.216-23.221C119.494,195.502,109.079,185.088,96.278,185.088z M96.278,216.523
                        c-4.53,0-8.215-3.688-8.215-8.221c0-4.53,3.685-8.215,8.215-8.215c4.53,0,8.216,3.685,8.216,8.215
                        C104.494,212.835,100.808,216.523,96.278,216.523z"/>
                      <path d="M173.719,185.088c-12.801,0-23.216,10.414-23.216,23.215c0,12.804,10.414,23.221,23.216,23.221
                        c12.802,0,23.218-10.417,23.218-23.221C196.937,195.502,186.521,185.088,173.719,185.088z M173.719,216.523
                        c-4.53,0-8.216-3.688-8.216-8.221c0-4.53,3.686-8.215,8.216-8.215c4.531,0,8.218,3.685,8.218,8.215
                        C181.937,212.835,178.251,216.523,173.719,216.523z"/>
                      <path d="M218.58,79.08c-1.42-1.837-3.611-2.913-5.933-2.913H63.152l-6.278-24.141c-0.86-3.305-3.844-5.612-7.259-5.612H18.876
                        c-4.142,0-7.5,3.358-7.5,7.5s3.358,7.5,7.5,7.5h24.94l6.227,23.946c0.031,0.134,0.066,0.267,0.104,0.398l23.157,89.046
                        c0.86,3.305,3.844,5.612,7.259,5.612h108.874c3.415,0,6.399-2.307,7.259-5.612l23.21-89.25C220.49,83.309,220,80.918,218.58,79.08z
                        M183.638,165.418H86.362l-19.309-74.25h135.895L183.638,165.418z"/>
                      <path d="M105.556,52.851c1.464,1.463,3.383,2.195,5.302,2.195c1.92,0,3.84-0.733,5.305-2.198c2.928-2.93,2.927-7.679-0.003-10.607
                        L92.573,18.665c-2.93-2.928-7.678-2.927-10.607,0.002c-2.928,2.93-2.927,7.679,0.002,10.607L105.556,52.851z"/>
                      <path d="M159.174,55.045c1.92,0,3.841-0.733,5.306-2.199l23.552-23.573c2.928-2.93,2.925-7.679-0.005-10.606
                        c-2.93-2.928-7.679-2.925-10.606,0.005l-23.552,23.573c-2.928,2.93-2.925,7.679,0.005,10.607
                        C155.338,54.314,157.256,55.045,159.174,55.045z"/>
                      <path d="M135.006,48.311c0.001,0,0.001,0,0.002,0c4.141,0,7.499-3.357,7.5-7.498l0.008-33.311c0.001-4.142-3.356-7.501-7.498-7.502
                        c-0.001,0-0.001,0-0.001,0c-4.142,0-7.5,3.357-7.501,7.498l-0.008,33.311C127.507,44.951,130.864,48.31,135.006,48.311z"/>
                    </g>
                    </svg>
                  <p>ยังไม่มีสินค้าในตะกร้า</p>
                  <small>เลือกสินค้าทางด้านซ้ายเพื่อเริ่มขายได้เลย 💳</small>
                </div>
              )}

              <StockErrorDialog
                show={showStockError}
                onClose={() => setShowStockError(false)}
                messageType={errorType}
              />

              {showCheckout && (
                <Checkout
                  cart={cart}
                  totalPrice={getTotalPrice()}
                  onClose={() => setShowCheckout(false)}
                  checkout={checkout}
                  onConfirmPayment={() => {}}
                />
              )}

              {showNumberPad && (
                <NumberPad
                  currentQuantity={currentQuantity}
                  handleQuantityChange={handleQuantityChange}
                  handleDeleteOne={handleDeleteOne}
                  handleClear={handleClear}
                  handleSetQuantity={handleSetQuantity}
                  setShowNumberPad={setShowNumberPad}
                  numpadErrorMessage={numpadErrorMessage}
                />
              )}

              {popupVisible && (
                <div
                  className="payment-popup-overlay"
                  onClick={() => {
                    setPopupVisible(false);
                    setShowReceipt(true); // ✅ เปิดใบเสร็จทันที
                  }}
                >
                  <div className="payment-popup" onClick={(e) => e.stopPropagation()}>
                    <h2>✅ ชำระเงินสำเร็จ!</h2>
                    <p>ขอบคุณที่ใช้บริการ 🎉</p>
                    <button
                      className="payment-popup-close"
                      onClick={() => {
                        setPopupVisible(false);
                        setShowReceipt(true);
                      }}
                    >
                      ปิด
                    </button>
                  </div>
                </div>
              )}
              {showReceipt && receiptData && (
                <ReceiptModal
                  receipt={receiptData}
                  onClose={() => setShowReceipt(false)}
                />
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductList;
