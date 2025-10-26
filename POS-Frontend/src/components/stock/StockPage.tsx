import React, { useState, useEffect, useMemo } from "react";
import { getStockData } from "../../api/stock/stock";
import { getSupplierData } from "../../api/suppliers/supplierApi";

import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { jwtDecode } from "jwt-decode";
import { getWarehouses } from "../../api/product/warehousesApi";
import { getCategories } from "../../api/product/categoryApi";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import "../../styles/stock/StockPage.css";
import "../../styles/stock/FilterControl.css";
import "../../styles/stock/StockDetailModal.css";

import StockDetailModal from "./component/StockDetailModal";
import GlobalPopup from "../layout/GlobalPopup";
import AddProductModal from "../product/AddProduct/AddProductModal"
import StockTable from "./component/StockTable";

import Pagination from "./component/Pagination";
import FilterControl from "./component/FilterControl";

interface StockItem {
  _id: string;
  barcode: string;
  totalQuantity: number;
  status: string;
  threshold: number; // ✅ พิมพ์ถูกและเป็น number
  updatedAt: string;
  productId: {
    _id: string;
    name: string;
    imageUrl?: string;
    category?: { _id: string; name: string };
  };
  supplierId?: { _id: string; companyName: string };
  location?: { _id: string; name: string; location: string; description?: string };
  expiryDate?: string;
  isActive?: boolean;
}


const StockPage: React.FC = () => {
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [selectedBarcode, setSelectedBarcode] = useState<string | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedWarehouses, setSelectedWarehouses] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<("active" | "inactive")[]>([]);

  const [user, setUser] = useState<{ userId: string; username: string; role: string; email: string } | null>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  //  Popup
  const [popupMessage, setPopupMessage] = useState<string>("");
  const [popupSuccess, setPopupSuccess] = useState<boolean>(true);
  const [showPopup, setShowPopup] = useState<boolean>(false);

  const [isModalOpen, setIsModalOpen] = useState(false);

  //  Pagination
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const navigate = useNavigate();

  //  fetchData reusable
  const fetchData = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("❌ No token found");
      setLoading(false);
      return;
    }
    try {
      const stock = await getStockData(token);
      setStockData(stock);
    } catch (err) {
      console.error("❌ Fetch data error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const warehouseList = await getWarehouses();
      setWarehouses(warehouseList);
    } catch (error) {
      console.error("Warehouse Fetch Error:", error);
    }
  };

  const fetchCategories = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const categoryList = await getCategories(token);
      setCategories(categoryList.data);
    } catch (error) {
      console.error("Category Fetch Error:", error);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const supplierList = await getSupplierData(token);
      setSuppliers(Array.isArray(supplierList) ? supplierList : supplierList.data || []);
    } catch (err:any) {
      // ถ้าโดน 401/403 ก็เงียบไว้และไม่โยน error ออกไป (กัน interceptor กลาง)
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        console.warn("Supplier endpoint requires admin, skipping for employee.");
        setSuppliers([]); 
        return;
      }
      console.error("Supplier Fetch Error:", err);
    }
  };


  //  decode user
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const decoded: any = jwtDecode(token);
        setUser({
          userId: decoded.userId,
          role: decoded.role,
          username: decoded.username,
          email: decoded.email,
        });
      } catch (error) {
        console.error("Invalid token:", error);
      }
    }
  }, []);

  //  load initial data
  const role = user?.role?.toLowerCase();

  useEffect(() => {
    fetchData();
    fetchWarehouses();
    fetchCategories();
    if (role === "admin") fetchSuppliers();
  }, [role]);

  //  helpers
  const getLocationName = (location: any) => {
    if (!location) return "ไม่ทราบที่เก็บ";
    if (location.name && location.location) return `${location.name} (${location.location})`;
    if (location.location) return location.location;
    const found = warehouses.find((w) => w._id === location._id);
    return found ? found.location : "ไม่ทราบที่เก็บ";
  };

  const getCategoryNameById = (categoryId: string | undefined) => {
    const category = categories.find((cat) => cat._id === categoryId);
    return category ? category.name : "ไม่ทราบหมวดหมู่";
  };

  const formatThaiDateTime = (dateString: string) =>
    new Date(dateString).toLocaleString("th-TH", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Bangkok",
    });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "สินค้าพร้อมขาย": return "";
      case "สินค้าหมด": return "❌";
      case "สินค้าหมดอายุ": return "";
      default: return "⚠️";
    }
  };

  //  sort ใหม่สุดก่อน
  const sortedStock = [...stockData].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  //  filter
  const filteredStock = sortedStock.filter((item) => {
    const searchText = searchQuery.toLowerCase();
    const productName = item.productId?.name?.toLowerCase() || "";
    const categoryName = item.productId?.category?.name?.toLowerCase() || "";
    const supplierName = item.supplierId?.companyName?.toLowerCase() || "";
    const barcode = item.barcode?.toLowerCase() || "";

    // 🔍 ค้นหาข้อความ
    let matchesSearch =
      productName.includes(searchText) ||
      categoryName.includes(searchText) ||
      supplierName.includes(searchText) ||
      barcode.includes(searchText);

    let matchesFilter = true;

    //  สถานะสินค้า (เลือกได้หลายอัน)
    if (selectedStatuses.length > 0) {
      let statusMatch = false;

      if (selectedStatuses.includes("low10") && item.totalQuantity < 10) {
        statusMatch = true;
      }
      if (selectedStatuses.includes(item.status)) {
        statusMatch = true;
      }

      matchesFilter = matchesFilter && statusMatch;
    }

    //  คลังสินค้า
    if (selectedWarehouses.length > 0) {
      matchesFilter =
        matchesFilter && selectedWarehouses.includes(item.location?._id || "");
    }

    //  หมวดหมู่
    if (selectedCategories.length > 0) {
      matchesFilter =
        matchesFilter && selectedCategories.includes(item.productId?.category?._id || "");
    }

    //  ซัพพลายเออร์
    if (selectedSuppliers.length > 0) {
      matchesFilter =
        matchesFilter && selectedSuppliers.includes(item.supplierId?._id || "");
    }

    //  วันหมดอายุ
    if (selectedExpiry.length > 0) {
      const now = new Date();
      const expiryThreshold = new Date();
      expiryThreshold.setDate(now.getDate() + 30);
      const exp = item.expiryDate ? new Date(item.expiryDate) : null;

      let expiryMatch = false;

      if (selectedExpiry.includes("expired") && exp !== null && exp < now) {
        expiryMatch = true;
      }
      if (
        selectedExpiry.includes("nearExpiry") &&
        exp !== null &&
        exp >= now &&
        exp <= expiryThreshold
      ) {
        expiryMatch = true;
      }

      matchesFilter = matchesFilter && expiryMatch;
    }

    //  Active / Inactive
    if (activeFilter.length > 0) {
      const currentStatus = item.isActive ? "active" : "inactive";
      matchesFilter = matchesFilter && activeFilter.includes(currentStatus);
    }

    return matchesSearch && matchesFilter;
  });

  // 🔢 Summary counts
  const now = new Date();
  const nearExpiryThreshold = new Date();
  nearExpiryThreshold.setDate(now.getDate() + 10);

  const hasStatus = (item: StockItem, status: string) =>
    item.status?.trim() === status;

  const summary = useMemo(() => {
    const list = stockData || [];
    const q = (n: any) => Number(n ?? 0);

    const now = new Date();
    const near = new Date();
    near.setDate(now.getDate() + 10);

    const isAvailable = (i: StockItem) =>
      (i.isActive ?? true) && q(i.totalQuantity) > 0 && i.status?.trim() === "สินค้าพร้อมขาย";

    const isLowStock = (i: StockItem) => {
      const qty = q(i.totalQuantity);
      const th = Number(i.threshold ?? 0);
      return (i.isActive ?? true) && qty > 0 && (i.status?.trim() === "สินค้าเหลือน้อย" || qty <= th);
    };

    const isOut = (i: StockItem) =>
      q(i.totalQuantity) <= 0 || i.status?.trim() === "สินค้าหมด";

    const isExpired = (i: StockItem) => {
      if (!i.expiryDate) return false;
      const d = new Date(i.expiryDate);
      return d < now;
    };

    const isNearExpiry = (i: StockItem) => {
      if (!i.expiryDate) return false;
      const d = new Date(i.expiryDate);
      return d >= now && d <= near;
    };

    return {
      available: list.filter(isAvailable).length,
      lowStock: list.filter(isLowStock).length,
      nearExpiry: list.filter(isNearExpiry).length,
      expired: list.filter(isExpired).length,
      outOfStock: list.filter(isOut).length,
    };
  }, [stockData]);

  //  pagination
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedStock = filteredStock.slice(startIndex, startIndex + itemsPerPage);
  const totalPages = Math.ceil(filteredStock.length / itemsPerPage);

  const handleRowClick = (barcode: string) => setSelectedBarcode(barcode);

  return (
    <div className="display">
      <div className="stock-container">
        {/* Header */}
        <div className="stock-header-wrapper">
          <h2 className="stock-header">📦 จัดการสต็อกสินค้า</h2>
          {loading && <p className="loadingStock">⏳ Loading...</p>}
          {error && <p className="error-message">{error}</p>}


          <div className="stock-summary">
            <div className="summary-item available">
              <label>✅ พร้อมขาย</label>
              <span>{summary.available}</span>
            </div>

            <div className="summary-item low">
              <label>⚠️ สินค้าเหลือน้อย</label>
              <span>{summary.lowStock}</span>
            </div>

            <div className="summary-item near-expiry">
              <label>⏰ ใกล้หมดอายุ</label>
              <span>{summary.nearExpiry}</span>
            </div>

            <div className="summary-item expired">
              <label>🧨 หมดอายุแล้ว</label>
              <span>{summary.expired}</span>
            </div>

            <div className="summary-item out">
              <label>❌ สินค้าหมด</label>
              <span>{summary.outOfStock}</span>
            </div>
          </div>

          <div className="stock-controls">
            <div className="search-container">
              <input
                type="text"
                placeholder="🔍 ค้นหาสินค้า..."
                className="search-input"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />

            </div>

            {/* ปุ่ม Filter อยู่ข้างๆช่องค้นหา */}
            <FilterControl
              selectedStatuses={selectedStatuses} setSelectedStatuses={setSelectedStatuses}
              selectedWarehouses={selectedWarehouses} setSelectedWarehouses={setSelectedWarehouses}
              selectedCategories={selectedCategories} setSelectedCategories={setSelectedCategories}
              selectedSuppliers={selectedSuppliers} setSelectedSuppliers={setSelectedSuppliers}
              selectedExpiry={selectedExpiry} setSelectedExpiry={setSelectedExpiry}
              activeFilter={activeFilter} setActiveFilter={setActiveFilter}
              warehouses={warehouses} categories={categories} suppliers={suppliers}
            />


            <div className="items-per-page">
              <label>แสดง: </label>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
              </select>
              <span> รายการต่อหน้า</span>

            </div>

          </div>
          {/*  Add Product */}
          {user?.role !== "employee" && (
            <button className="add-product-button" onClick={() => setIsModalOpen(true)}>
              <FontAwesomeIcon icon={faPlus} /> เพิ่มสินค้า
            </button>
          )}
          {/* 🔢 นับจำนวนสินค้า */}
          <div className="stock-count">
            รวมทั้งหมด: <span>{filteredStock.length}</span> รายการ
          </div>
        </div>
        {/*  Table */}
        <div className="stock-table-wrapper">
          <StockTable
            stock={paginatedStock}
            getLocationName={getLocationName}
            getCategoryNameById={getCategoryNameById}
            formatThaiDateTime={formatThaiDateTime}
            getStatusIcon={getStatusIcon}
            handleRowClick={handleRowClick}
          />
        </div>

        {/*  Pagination */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          setCurrentPage={setCurrentPage}
        />

        {/*  Modals */}
        <StockDetailModal
          isOpen={!!selectedBarcode}
          barcode={selectedBarcode}
          stock={selectedBarcode ? stockData.find((s) => s.barcode === selectedBarcode) : null}
          onClose={() => setSelectedBarcode(null)}
          onSuccess={(msg, success) => {
            fetchData();
            if (msg) {
              setPopupMessage(msg);
              setPopupSuccess(success ?? true);
              setShowPopup(true);
            }
          }}
        />

        <AddProductModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => fetchData()}
        />

        <GlobalPopup
          message={popupMessage}
          isSuccess={popupSuccess}
          show={showPopup}
          setShow={setShowPopup}
        />
      </div>
    </div>
  );
};

export default StockPage;
