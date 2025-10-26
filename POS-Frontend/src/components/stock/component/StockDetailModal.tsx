import React, { useState, useEffect } from "react";
import { updateProduct, updateProductImage } from "../../../api/product/productApi";
import { updateStock, deleteStock } from "../../../api/stock/stock";
import { getWarehouses } from "../../../api/product/warehousesApi";
import { useGlobalPopup } from "../../../components/common/GlobalPopupEdit";
import { useNavigate } from "react-router-dom";

interface StockDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  barcode: string | null;
  stock: any;
  onSuccess: (message?: string, success?: boolean) => void;
}

// ---- utils: อ่าน payload จาก JWT
const getPayloadFromToken = (): any | null => {
  try {
    const t =
      localStorage.getItem("token") ||
      localStorage.getItem("authToken") ||
      "";
    if (!t || !t.includes(".")) return null;
    return JSON.parse(atob(t.split(".")[1]));
  } catch {
    return null;
  }
};

// ---- utils: อ่าน role (localStorage -> token -> fallback employee)
const readRole = (): "admin" | "employee" => {
  const ls = (localStorage.getItem("role") || "").trim().toLowerCase();
  if (ls === "admin" || ls === "employee") return ls as any;
  const payload = getPayloadFromToken();
  const pr = (payload?.role || "").trim().toLowerCase();
  if (pr === "admin" || pr === "employee") return pr as any;
  return "employee";
};

const StockDetailModal: React.FC<StockDetailModalProps> = ({
  isOpen,
  onClose,
  barcode,
  stock,
  onSuccess,
}) => {
  const [formData, setFormData] = useState<any>(stock?.productId || {});
  const [stockData, setStockData] = useState<any>(stock || {});
  const [activeTab, setActiveTab] = useState<"product" | "stock">("product");
  const [image, setImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const { showPopup, closePopup } = useGlobalPopup();
  const [warehouseName, setWarehouseName] = useState<string>("ไม่พบข้อมูล");
  const [warehouseId, setWarehouseId] = useState<string>("");

  const navigate = useNavigate();

  // ---- role & readOnly mode
  const role = readRole();
  const isAdmin = role === "admin";
  const isReadOnly = !isAdmin;

  useEffect(() => {
    if (stock?.productId) setFormData(stock.productId);
    if (stock) {
      const normalized = {
        ...stock,
        supplier: stock?.supplierId?.companyName || stock?.supplier || "",
        location: stock?.location?._id || stock?.location || "",
      };
      setStockData(normalized);
    }

    const fetchWarehouse = async () => {
      try {
        const warehouses = await getWarehouses();
        if (stock?.location?._id) {
          const found = warehouses.find((w: any) => w._id === stock.location._id);
          if (found) {
            setWarehouseId(found._id);
            setWarehouseName(found.location);
          }
        } else if (stock?.location?.location) {
          setWarehouseId(stock.location._id);
          setWarehouseName(stock.location.location);
        }
      } catch (err) {
        console.error("❌ Error fetching warehouses:", err);
      }
    };
    fetchWarehouse();
  }, [stock]);

  if (!isOpen || !stock) return null;

  const checkIsOtherSupplier = (): boolean => {
    const supplierName =
      stockData?.supplier ||
      stockData?.supplierId?.companyName ||
      "";
    const nameLower = supplierName.trim().toLowerCase();
    return nameLower === "อื่นๆ" || nameLower === "อื่น ๆ" || nameLower === "other";
  };

  // ---- block change in readOnly mode
  const handleProductChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (isReadOnly) return;
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleStockChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (isReadOnly) return;
    const { name, type, value } = e.target;
    setStockData((prev: any) => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return; // กันกด submit ผ่านทางโปรแกรม
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      setLoading(true);

      const updatedStockData: any = {
        supplier: stockData?.supplier || stockData?.supplierId?.companyName || "",
        location: stockData?.location?._id || stockData?.location || "",
        threshold: stockData.threshold,
        status: stockData.status,
        notes: stockData.notes,
        isActive: stockData.isActive,
        costPrice: stockData.costPrice,
        salePrice: stockData.salePrice,
        batchNumber: stockData.batchNumber,
        expiryDate: stockData.expiryDate,
      };

      const updatedProductData: any = {
        ...formData,
        isActive: stockData.isActive,
      };

      if (checkIsOtherSupplier()) {
        updatedStockData.quantity = stockData.quantity;
      }

      await updateProduct(stock.productId._id, updatedProductData);
      if (stock?.barcode) {
        await updateStock(stock.barcode, updatedStockData);
      }

      if (image) {
        const formDataUpload = new FormData();
        formDataUpload.append("image", image);
        formDataUpload.append("name", formData.name);
        formDataUpload.append("description", formData.description);
        formDataUpload.append("category", formData.category?._id || "");
        formDataUpload.append("isActive", String(stockData.isActive));
        formDataUpload.append("costPrice", String(stockData.costPrice));
        formDataUpload.append("salePrice", String(stockData.salePrice));
        await updateProductImage(stock.productId._id, formDataUpload, token);
      }

      onSuccess("✅ บันทึกการแก้ไขสำเร็จ", true);
      onClose();
    } catch (err: any) {
      console.error("❌ Update error:", err);
      let errorMessage = "เกิดข้อผิดพลาดในการอัปเดตข้อมูล";
      if (err.response) {
        errorMessage =
          err.response.data?.message ||
          err.response.data?.error ||
          `เซิร์ฟเวอร์ตอบกลับด้วยรหัส ${err.response.status}`;
      } else if (err.request) {
        errorMessage = "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้";
      } else if (err.message) {
        errorMessage = err.message;
      }
      onSuccess(`${errorMessage}`, false);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (isReadOnly) return; // กันลบ
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      setLoading(true);
      await deleteStock(stock.barcode);
      onSuccess("ลบสต็อกสำเร็จ 🗑️", true);
      onClose();
    } catch (err) {
      console.error("❌ Delete error:", err);
      onSuccess("ลบสต็อกไม่สำเร็จ ❌", false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="product-detail-modal-overlay">
      <div className="product-detail-modal-content">
        <button className="modal-close" onClick={onClose}>✖</button>
        <h2>รายละเอียดสินค้า</h2>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={activeTab === "product" ? "tab active" : "tab"}
            onClick={() => setActiveTab("product")}
          >
            ข้อมูลสินค้า
          </button>
          <button
            className={activeTab === "stock" ? "tab active" : "tab"}
            onClick={() => setActiveTab("stock")}
          >
            ข้อมูลสต็อก
          </button>
        </div>

        <form onSubmit={handleSubmit} className="stock-detail-form">
          {/* --- PRODUCT TAB --- */}
          {activeTab === "product" && (
            <div className="tab-content">
              <div className="stock-form-row">
                <div className="stock-form-group">
                  <label>ชื่อสินค้า:</label>
                  <input
                    type="text"
                    name="name"
                    value={formData?.name || ""}
                    onChange={handleProductChange}
                    placeholder="กรอกชื่อสินค้า..."
                    readOnly={isReadOnly}
                  />
                </div>

                <div className="stock-form-group">
                  <label>หมวดหมู่:</label>
                  <input
                    type="text"
                    name="category"
                    value={
                      typeof formData?.category === "object"
                        ? formData.category?.name || "-"
                        : formData?.category || "ไม่พบข้อมูล"
                    }
                    readOnly
                    className="readonly-input"
                  />
                </div>
              </div>

              <div className="stock-form-group">
                <label>รายละเอียด:</label>
                <textarea
                  name="description"
                  value={formData?.description || ""}
                  onChange={handleProductChange}
                  placeholder="ระบุรายละเอียดสินค้า..."
                  rows={3}
                  readOnly={isReadOnly}
                />
              </div>

              <div className="stock-form-group">
                <label>เปลี่ยนรูปสินค้า:</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => !isReadOnly && e.target.files && setImage(e.target.files[0])}
                  disabled={isReadOnly}
                />
                {(image || formData?.imageUrl) && (
                  <img
                    src={image ? URL.createObjectURL(image) : formData.imageUrl}
                    alt="preview"
                    className="stock-product-preview"
                  />
                )}
              </div>
            </div>
          )}

          {/* --- STOCK TAB --- */}
          {activeTab === "stock" && (
            <div className="tab-content">
              <div className="stock-form-row">
                <div className="stock-form-group">
                  <label>จำนวนสต็อก:</label>
                  <div className="stock-input-wrapper">
                    <input
                      type="number"
                      name="quantity"
                      value={stockData.totalQuantity || 0}
                      onChange={handleStockChange}
                      disabled={isReadOnly || !checkIsOtherSupplier()}
                    />
                    {!checkIsOtherSupplier() && (
                      <span className="disabled-tooltip">
                        ⚠️ ไม่สามารถแก้ไขจำนวนได้<br />เนื่องจากเป็นสินค้านำเข้าภายนอก
                      </span>
                    )}
                  </div>
                </div>

                <div className="stock-form-group">
                  <label>ค่าขั้นต่ำสต็อก (Threshold):</label>
                  <input
                    type="number"
                    name="threshold"
                    value={stockData?.threshold || 0}
                    onChange={handleStockChange}
                    disabled={isReadOnly}
                  />
                </div>
              </div>

              <div className="stock-form-row">
                <div className="stock-form-group">
                  <label>ราคาทุน (Cost Price):</label>
                  <input
                    type="number"
                    name="costPrice"
                    value={stockData?.costPrice || 0}
                    onChange={handleStockChange}
                    disabled={isReadOnly}
                  />
                </div>

                <div className="stock-form-group">
                  <label>ราคาขาย (Sale Price):</label>
                  <input
                    type="number"
                    name="salePrice"
                    value={stockData?.salePrice || 0}
                    onChange={handleStockChange}
                    disabled={isReadOnly}
                  />
                </div>
              </div>

              <div className="stock-form-row">
                <div className="stock-form-group">
                  <label>ซัพพลายเออร์:</label>
                  <input
                    type="text"
                    value={
                      stockData?.supplierId?.companyName ||
                      stockData?.supplier ||
                      "ไม่พบข้อมูล"
                    }
                    readOnly
                  />
                </div>

                <div className="stock-form-group">
                  <label>คลังสินค้า:</label>
                  <input type="text" value={warehouseName || "ไม่พบข้อมูล"} readOnly />
                </div>
              </div>

              <div className="stock-form-row">
                <div className="stock-form-group">
                  <label>เลขบาร์โค้ต:</label>
                  <input
                    type="text"
                    name="barcode"
                    value={stockData?.barcode || ""}
                    onChange={handleStockChange}
                    readOnly
                  />
                </div>
                <div className="stock-form-group">
                  <label>หมายเหตุ:</label>
                  <input
                    type="text"
                    name="notes"
                    value={stockData?.notes || ""}
                    onChange={handleStockChange}
                    disabled={isReadOnly}
                  />
                </div>
              </div>

              <div className="stock-form-row">
                <div className="stock-form-group">
                  <label>หน่วยสินค้า:</label>
                  <input
                    type="text"
                    name="units"
                    value={
                      Array.isArray(stockData?.units)
                        ? stockData.units.map((u: any) => `${u.name} (x${u.quantity})`).join(", ")
                        : stockData.units || "-"
                    }
                    readOnly
                  />
                </div>
                <div className="stock-form-group">
                  <label>สถานะสินค้า:</label>
                  <div className="toggle-wrapper">
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        name="isActive"
                        checked={!!stockData?.isActive}
                        onChange={handleStockChange}
                        disabled={isReadOnly}
                      />
                      <span className="slider"></span>
                    </label>
                    <span className="toggle-text">
                      {stockData?.isActive ? "เปิดขาย ✅" : "ปิดขาย ❌"}
                    </span>
                  </div>
                </div>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  className="stock-import-btn"
                  onClick={() => navigate("/create-purchase-order")}
                >
                  นำเข้าสินค้าใหม่
                </button>
              )}
            </div>
          )}

          {/* --- ACTIONS --- */}
          <div className="stock-form-actions">
            {isAdmin && (
              <button
                type="button"
                className="delete-btn-modal"
                onClick={() =>
                  showPopup({
                    type: "confirm",
                    message: `ต้องการลบสต็อก "${formData?.name || "ไม่ทราบชื่อ"}" ใช่ไหม?`,
                    onConfirm: async () => {
                      await handleDelete();
                      closePopup();
                      onClose();
                    },
                  })
                }
              >
                ลบสต็อก
              </button>
            )}

            {isAdmin && (
              <button
                type="submit"
                className={`save-btn-modal ${loading ? "loading" : ""}`}
                disabled={loading}
              >
                {loading ? <span className="spinner"></span> : "บันทึกการแก้ไข"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default StockDetailModal;