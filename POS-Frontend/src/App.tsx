import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";

import { Routes, Route } from "react-router-dom";
import Homepage from "./components/pages/Homepage";
import Header from "./components/layout/Header";
import Sidebar from "./components/layout/Sidebar";
import Dashboard from "./components/pages/Dashboard";
import ProductList from "./components/product/ProductList";
import StockPage from "./components/stock/StockPage";
import CreateOrder from "./components/purchaseOrder/CreatePurchaseOrderPage";
import SupplierList from "./components/suppliers/SupplierList";
import UserSettings from "./components/pages/UserSettings";
import ReceiptPage from "./components/receipt/ReceiptPage";
import Search from "./components/product/BarcodeSearch";
import SalePage from "./components/pages/Dashboard";
import PaymentPage from "./components/payment/PaymentPage";
import EmployeeList from "./components/aboutStore/EmployeePage";
import PurchaseOrderPage from "./components/purchaseOrder/PurchaseOrderPage";
import EmployeePage from "./components/pages/Employee/Dashboard-employee";
import StockTransaction from "./components/stock/StockTransaction";
import ExpiredPage from "./components/stock/ExpiredPage";
import BarcodePage from "./components/barcode/BarcodeStockPage";
import DiscountPage from "./components/payment/DiscountPage";
import WarehousePage from "./components/warehouses/WarehouseList"
import { GlobalPopupProvider } from "./components/common/GlobalPopupEdit";
import QCInspectionPage from "./components/qc/QCInspectionPage";
import RefundPage from "./components/payment/RefundPage";
import StockLotPage from "./components/stock/stocklot/StockLotPage";
import { getMenuName } from "./constants/menuMapping";
import { isTokenValid } from "./utils/authUtils";
import { useTokenRefresh } from "./hooks/useTokenRefresh";
import "./api/apiClient"; // Import to initialize interceptors and global config

import "./App.css";


const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [activeMenu, setActiveMenu] = useState<string>(""); // state สำหรับเก็บชื่อเมนู

  const navigate = useNavigate();
  const location = useLocation();
  const isLoggedIn: boolean = Boolean(token && isTokenValid(token));

  // mock user (ภายหลังอาจดึงจาก API หรือ localStorage)
  const [user ] = useState<{ role: string; nameStore: string } | null>({
    role: "admin",
    nameStore: "EAZYPOS",
  });

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  // toggle dropdown
  const toggleDropdown = (menu: string) => {
    setOpenDropdown(openDropdown === menu ? null : menu);
  };

  // handle click menu
  const handleMenuClick = (path: string, menuName: string) => {
    setActiveMenu(menuName);   // อัปเดตชื่อเมนู
    navigate(path);            // ไปยัง path โดยไม่ต้องรีเฟรช
  };
  useEffect(() => {
    const menuName = getMenuName(location.pathname, "th");
    if (menuName) {
      setActiveMenu(menuName);
    }
  }, [location.pathname]);

  useEffect(() => {
    const handleStorageChange = () => {
      setToken(localStorage.getItem("token"));
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Initialize automatic token refresh hook
  useTokenRefresh();

  return (
    <GlobalPopupProvider>
      <div className={`app-container ${isSidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
        <Header
          toggleSidebar={toggleSidebar}
          isSidebarOpen={isSidebarOpen}
          isLoggedIn={isLoggedIn}
          activeMenu={activeMenu || "ยินดีต้อนรับสู่ EAZYPOS"}
        />

        {isLoggedIn && (
          <Sidebar
            isSidebarOpen={isSidebarOpen}
            openDropdown={openDropdown}
            toggleDropdown={toggleDropdown}
            handleMenuClick={handleMenuClick}
            user={user}
          />
        )}

        <div className="main-content">
          <Routes>
            <Route path="/" element={<Homepage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/suppliers" element={<SupplierList />} />
            <Route path="settingProfile" element={<UserSettings />} />
            <Route path="/reports/salehistory" element={<PaymentPage />} />
            <Route path="setting/employee" element={<EmployeeList />} />
            <Route path="/reports/receipts" element={<ReceiptPage />} />
            <Route path="/products/search" element={<Search />} />
            <Route path="/purchase-orders" element={<PurchaseOrderPage />} />
            <Route path="/reports/sales" element={<SalePage />} />
            <Route path="/employee-dashboard" element={<EmployeePage />} />
            <Route path="/qc/:poId" element={<QCInspectionPage />} />
            <Route path="/reports/refund" element={<RefundPage />} />
            <Route path="/stocklots" element={<StockLotPage />} />

            <Route
              path="/shop"
              element={
                <ProductList
                  isSidebarOpen={isSidebarOpen}
                  toggleSidebar={toggleSidebar}
                />
              }
            />
            <Route path="/stocks" element={<StockPage />} />
            <Route path="/stockTransaction" element={<StockTransaction />} />
            <Route path="/create-purchase-order" element={<CreateOrder />} />
            <Route path="/expired" element={<ExpiredPage />} />
            <Route path="/barcode" element={<BarcodePage />} />
            <Route path="/discount" element={<DiscountPage />} />
            <Route path="/warehouse" element={<WarehousePage />} />

          </Routes>
        </div>
      </div>
    </GlobalPopupProvider>
  );

};

export default App;