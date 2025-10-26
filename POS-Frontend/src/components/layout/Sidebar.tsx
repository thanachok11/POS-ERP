import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHome,
  faCaretDown,
  faShoppingCart,
  faChartLine,
  faFileInvoice,
  faClipboardList,
  faReceipt,
  faHistory,
  faBox,
  faCartPlus,
  faBarcode,
  faScroll,
  faExclamationTriangle,
  faCog,
  faUserPlus,
  faTruck,
  faPercent,
  faWarehouse,
  faMoneyBillTransfer,
  faBoxesStacked,
  faBarChart,
} from "@fortawesome/free-solid-svg-icons";
import "../../styles/layout/Sidebar.css";

interface SidebarUser {
  role: string;
  nameStore?: string;
  storeName?: string;
  store?: { name?: string };
}

interface SidebarProps {
  isSidebarOpen: boolean;
  openDropdown: string | null;
  toggleDropdown: (menu: string) => void;
  handleMenuClick: (path: string, menuName: string) => void;
  user: SidebarUser | null;
}

const getPayloadFromToken = (): any | null => {
  try {
    const t =
      localStorage.getItem("token") || localStorage.getItem("authToken") || "";
    if (!t || !t.includes(".")) return null;
    return JSON.parse(atob(t.split(".")[1]));
  } catch {
    return null;
  }
};

const readRole = (user: SidebarUser | null): string => {
  // 1) จาก localStorage มาก่อนสุด
  const lsRole = (localStorage.getItem("role") || "").trim().toLowerCase();
  if (lsRole) return lsRole;

  // 2) จาก token payload
  const payload = getPayloadFromToken();
  const tokenRole = (payload?.role || "").trim().toLowerCase();
  if (tokenRole) return tokenRole;

  // 3) สุดท้ายค่อย fallback ไปที่ props (กัน stale state)
  const propRole = (user?.role || "").trim().toLowerCase();
  if (propRole) return propRole;

  // ดีฟอลต์ให้ปลอดภัยเป็น employee
  return "employee";
};

const readStoreName = (user: SidebarUser | null): string => {
  // 1) จาก localStorage (มาก่อน เพื่อให้ทันที)
  const fromStorage =
    localStorage.getItem("nameStore") ||
    localStorage.getItem("storeName") ||
    localStorage.getItem("store_name") ||
    "";
  if (fromStorage && fromStorage.trim()) return fromStorage.trim();

  // 2) จาก props
  const fromUser =
    user?.nameStore || user?.storeName || user?.store?.name || "";
  if (fromUser && fromUser.trim()) return fromUser.trim();

  // 3) จาก token payload
  const payload = getPayloadFromToken();
  const fromToken =
    payload?.nameStore || payload?.storeName || payload?.store?.name || "";
  if (fromToken && fromToken.trim()) return fromToken.trim();

  return "EAZYPOS";
};

const ensureNameStorePersisted = () => {
  // ถ้า localStorage ยังไม่มี ให้ดึงจาก token แล้วเขียนเก็บไว้
  const existing =
    localStorage.getItem("nameStore") ||
    localStorage.getItem("storeName") ||
    localStorage.getItem("store_name");
  if (!existing) {
    const payload = getPayloadFromToken();
    const fromToken =
      payload?.nameStore || payload?.storeName || payload?.store?.name || "";
    if (fromToken) localStorage.setItem("nameStore", fromToken);
  }
};

const Sidebar: React.FC<SidebarProps> = ({
  isSidebarOpen,
  openDropdown,
  toggleDropdown,
  handleMenuClick,
  user,
}) => {
  const sidebarRef = useRef<HTMLDivElement>(null);

  // อ่าน role/ชื่อร้านอย่าง reactive
  const [storeName, setStoreName] = useState<string>("EAZYPOS");
  const [role, setRole] = useState<string>("employee");
  const isAdmin = role === "admin";
  const isEmployee = role === "employee";

  useEffect(() => {
    // อัปเดต role + ชื่อร้านทุกครั้งที่ user/token/storage เปลี่ยน
    const refresh = () => {
      setRole(readRole(user));

      const ls =
        localStorage.getItem("nameStore") ||
        localStorage.getItem("storeName") ||
        localStorage.getItem("store_name") ||
        "";
      if (ls) setStoreName(ls);
      else {
        const payload = getPayloadFromToken();
        const fromToken =
          payload?.nameStore ||
          payload?.storeName ||
          payload?.store?.name ||
          "";
        setStoreName(fromToken || "EAZYPOS");
      }
    };

    refresh();
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (
        [
          "role",
          "token",
          "authToken",
          "nameStore",
          "storeName",
          "store_name",
        ].includes(e.key)
      ) {
        refresh();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [user]);

  // ----- กันคลิกเข้าหน้าแอดมิน (UI route guard) -----
  const adminOnlyPaths = new Set<string>([
    "/warehouse",
    "/stocklots",
    "/create-purchase-order",
    "/purchase-orders",
    "/setting/employee",
    "/suppliers",
    "/discount",
    "/reports/sales",
  ]);

  const safeMenuClick = (path: string, name: string) => {
    if (adminOnlyPaths.has(path) && !isAdmin) {
      alert("หน้านี้สำหรับผู้ดูแลระบบเท่านั้น");
      return;
    }
    handleMenuClick(path, name);
  };

  const goHomeByRole = () => {
    const r = readRole(user); // อ่านจาก token/localStorage/props ตามลำดับ
    const path = r === "employee" ? "/employee-dashboard" : "/";
    handleMenuClick(path, "หน้าแรก");
  };

  // --- ปิด dropdown เมื่อคลิกนอก sidebar
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node) &&
        openDropdown
      ) {
        toggleDropdown("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdown, toggleDropdown]);
  console.log("Sidebar render with storeName:", storeName);
  return (
    <aside
      ref={sidebarRef}
      className={`sidebar ${isSidebarOpen ? "open" : "closed"}`}
    >
      <div className="sidebar-header">
        <span className="sidebar-logo-text">{storeName}</span>
      </div>

      <div className="sidebar-scrollable">
        <ul className="navLinks">
          {/* หน้าหลัก */}
          <li className="item-dropdown" onClick={() => toggleDropdown("home")}>
            <FontAwesomeIcon icon={faHome} className="icon" />
            <span className="menu-text-home">หน้าหลัก</span>
            <FontAwesomeIcon
              icon={faCaretDown}
              className={`dropdown-icon ${openDropdown === "home" ? "open" : ""}`}
            />
          </li>

          <ul className={`item-details ${openDropdown === "home" ? "open" : ""} ${isSidebarOpen ? "" : "floating"}`}>
            <li onClick={goHomeByRole}>
              <FontAwesomeIcon icon={faBarChart} className="icon" />{" "}
              <span className="dropdown-text-buy">หน้าแรก</span>
            </li>
            <li onClick={() => handleMenuClick("/shop", "ขายสินค้า")}>
              <FontAwesomeIcon icon={faShoppingCart} className="icon" />{" "}
              <span className="dropdown-text-buy">ขายสินค้า</span>
            </li>
          </ul>

          {/* รายงาน */}
          <li
            className="item-dropdown"
            onClick={() => toggleDropdown("reports")}
          >
            <FontAwesomeIcon icon={faChartLine} className="icon" />{" "}
            <span className="menu-text-dashboard">รายงาน</span>
            <FontAwesomeIcon
              icon={faCaretDown}
              className={`dropdown-icon ${
                openDropdown === "reports" ? "open" : ""
              }`}
            />
          </li>
          <ul className={`item-details ${openDropdown === "reports" ? "open" : ""} ${isSidebarOpen ? "" : "floating"}`}>
            {/* ซ่อนเฉพาะเมนูนี้เมื่อ employee */}
            {isAdmin && (
              <li onClick={() => handleMenuClick("/reports/sales", "รายงานยอดขาย")}>
                <FontAwesomeIcon icon={faFileInvoice} className="icon" />{" "}
                <span className="dropdown-text-sale">รายงานยอดขาย</span>
              </li>
            )}

            <li onClick={() => handleMenuClick("/reports/receipts", "ใบเสร็จ")}>
              <FontAwesomeIcon icon={faReceipt} className="icon" />{" "}
              <span className="dropdown-text-receipt">ใบเสร็จ</span>
            </li>
            <li onClick={() => handleMenuClick("/reports/salehistory", "ประวัติการขาย")}>
              <FontAwesomeIcon icon={faHistory} className="icon" />{" "}
              <span className="dropdown-text-historysale">ประวัติการขาย</span>
            </li>
            <li onClick={() => handleMenuClick("/reports/refund", "คืนสินค้า")}>
              <FontAwesomeIcon icon={faMoneyBillTransfer} className="icon" />{" "}
              <span className="dropdown-text-refund">คืนสินค้า</span>
            </li>
          </ul>

          {/* จัดการสินค้า */}
          <li
            className="item-dropdown"
            onClick={() => toggleDropdown("products")}
          >
            <FontAwesomeIcon icon={faBox} className="icon" />{" "}
            <span className="menu-text-product">จัดการสินค้า</span>
            <FontAwesomeIcon
              icon={faCaretDown}
              className={`dropdown-icon ${
                openDropdown === "products" ? "open" : ""
              }`}
            />
          </li>
          <ul
            className={`item-details ${
              openDropdown === "products" ? "open" : ""
            } ${isSidebarOpen ? "" : "floating"}`}
          >
            <li onClick={() => handleMenuClick("/stocks", "สต็อกสินค้า")}>
              <FontAwesomeIcon icon={faClipboardList} className="icon" />{" "}
              <span className="dropdown-text-stock">สต็อกสินค้า</span>
            </li>

            {/* เฉพาะแอดมิน */}
            {isAdmin && (
              <>
                <li onClick={() => safeMenuClick("/warehouse", "คลังสินค้า")}>
                  <FontAwesomeIcon icon={faWarehouse} className="icon" />{" "}
                  <span className="dropdown-text-warehouse">คลังสินค้า</span>
                </li>
                <li onClick={() => safeMenuClick("/stocklots", "ล็อตสินค้า")}>
                  <FontAwesomeIcon icon={faBoxesStacked} className="icon" />{" "}
                  <span className="dropdown-text-stockslot">ล็อตสินค้า</span>
                </li>
                <li
                  onClick={() =>
                    safeMenuClick("/create-purchase-order", "นำเข้าสินค้า / สร้าง PO")
                  }
                >
                  <FontAwesomeIcon icon={faCartPlus} className="icon" />{" "}
                  <span className="dropdown-text-buyproduct">
                    นำเข้าสินค้า / สั่งซื้อสินค้า
                  </span>
                </li>
                <li
                  onClick={() =>
                    safeMenuClick("/purchase-orders", "ใบสั่งซื้อ (PO)")
                  }
                >
                  <FontAwesomeIcon icon={faScroll} className="icon" />{" "}
                  <span className="dropdown-text-purchase-orders">
                    ใบสั่งซื้อ
                  </span>
                </li>
              </>
            )}

            <li onClick={() => handleMenuClick("/barcode", "บาร์โค้ดสินค้า")}>
              <FontAwesomeIcon icon={faBarcode} className="icon" />{" "}
              <span className="dropdown-text-barcode">บาร์โค้ดสินค้า</span>
            </li>
            <li
              onClick={() =>
                handleMenuClick("/expired", "สินค้าใกล้หมด / สินค้าหมด")
              }
            >
              <FontAwesomeIcon icon={faExclamationTriangle} className="icon" />{" "}
              <span className="dropdown-text-expired">
                สินค้าใกล้หมด / สินค้าหมด
              </span>
            </li>
            <li
              onClick={() =>
                handleMenuClick(
                  "/stockTransaction",
                  "ประวัติการเคลื่อนไหวสต็อก"
                )
              }
            >
              <FontAwesomeIcon icon={faHistory} className="icon" />{" "}
              <span className="dropdown-text-transaction">
                ประวัติการเคลื่อนไหวสต็อก
              </span>
            </li>
          </ul>

          {/* ตั้งค่าร้านค้า (เฉพาะ Admin) */}
          {isAdmin && (
            <>
              <li
                className="item-dropdown"
                onClick={() => toggleDropdown("setting")}
              >
                <FontAwesomeIcon icon={faCog} className="icon" />
                <span className="menu-text-aboutstore">ตั้งค่าร้านค้า</span>
                <FontAwesomeIcon
                  icon={faCaretDown}
                  className={`dropdown-icon ${
                    openDropdown === "setting" ? "open" : ""
                  }`}
                />
              </li>
              <ul
                className={`item-details ${
                  openDropdown === "setting" ? "open" : ""
                } ${isSidebarOpen ? "" : "floating"}`}
              >
                <li
                  onClick={() =>
                    safeMenuClick("/setting/employee", "จัดการพนักงาน")
                  }
                >
                  <FontAwesomeIcon icon={faUserPlus} className="icon" />{" "}
                  <span className="dropdown-text-employee">จัดการพนักงาน</span>
                </li>
                <li
                  onClick={() =>
                    safeMenuClick("/suppliers", "ผู้ผลิต / ซัพพลายเออร์")
                  }
                >
                  <FontAwesomeIcon icon={faTruck} className="icon" />{" "}
                  <span className="dropdown-text-suppliers">
                    ผู้ผลิต / ซัพพลายเออร์
                  </span>
                </li>
                <li
                  onClick={() => handleMenuClick("/discount", "จัดการส่วนลด")}
                >
                  <FontAwesomeIcon icon={faPercent} className="icon" />{" "}
                  <span className="dropdown-text-discount">จัดการส่วนลด</span>
                </li>
              </ul>
            </>
          )}
        </ul>
      </div>
    </aside>
  );
};

export default Sidebar;