/**
 * Mapping of application routes to their localized menu names.
 * This file centralizes the menu naming logic to keep App.tsx clean
 * and to easily support multiple languages in the future.
 */

export type Language = "th" | "en";

export const MENU_MAP: Record<string, { th: string; en: string }> = {
  "/shop": { th: "ซื้อสินค้า", en: "Shop" },
  "/reports/sales": { th: "รายงานยอดขาย", en: "Sales Report" },
  "/reports/stock": { th: "รายงานสินค้าคงเหลือ", en: "Stock Report" },
  "/reports/receipts": { th: "ใบเสร็จ", en: "Receipts" },
  "/reports/salehistory": { th: "ประวัติการขาย", en: "Sale History" },
  "/stocks": { th: "สต็อกสินค้า", en: "Inventory" },
  "/createOrder": { th: "นำเข้าสินค้าใหม่", en: "New Import" },
  "/barcode": { th: "บาร์โค้ด", en: "Barcode" },
  "/debt": { th: "ค้างชำระ", en: "Debt" },
  "/expired": { th: "สินค้าเหลือน้อย/สินค้าหมด", en: "Low Stock/Expired" },
  "/setting/employee": { th: "ตั้งค่าพนักงาน", en: "Employee Settings" },
  "/suppliers": { th: "ผู้ผลิต", en: "Suppliers" },
  "/create-purchase-order": { th: "สร้างคำสั่งซื้อ", en: "Create Purchase Order" },
  "/purchase-orders": { th: "คำสั่งซื้อ", en: "Purchase Orders" },
  "/stockTransaction": { th: "ประวัติการเคลื่อนไหวของคลังสินค้า", en: "Stock Movement History" },
  "/discount": { th: "จัดการส่วนลด", en: "Manage Discount" },
  "/qc": { th: "ตรวจสอบสินค้า (QC)", en: "Quality Control (QC)" },
  "/warehouse": { th: "จัดการคลังสินค้า", en: "Manage Warehouse" },
  "/refund": { th: "คืนสินค้า", en: "Refund" },
  "/user": { th: "จัดการผู้ใช้งาน", en: "User Management" },
  "/stocklots": { th: "จัดการล็อตสินค้า", en: "Stock Lot Management" },
  "/products": { th: "จัดการสินค้า", en: "Product Management" },
  "/": { th: "หน้าแรก", en: "Home" },
  "/dashboard": { th: "หน้าแรก", en: "Dashboard" },
};

/**
 * Returns the localized menu name for a given path.
 * @param path The current URL pathname
 * @param lang The target language (defaults to 'th')
 * @returns The menu label or empty string if not found
 */
export const getMenuName = (path: string, lang: Language = "th"): string => {
  // Exact match
  if (MENU_MAP[path]) {
    return MENU_MAP[path][lang];
  }

  // Prefix match for dynamic routes (e.g., /qc/:poId)
  const patternMatch = Object.keys(MENU_MAP).find(p => path.startsWith(p) && p !== "/");
  if (patternMatch) {
    return MENU_MAP[patternMatch][lang];
  }

  return "";
};
