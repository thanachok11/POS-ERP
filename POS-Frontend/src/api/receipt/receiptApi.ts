// receiptApi.ts
import axios, { AxiosError, AxiosHeaders } from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL as string;

// ---------- Axios instance (แนบ token อัตโนมัติ + กัน Bearer ซ้ำ) ----------
const receiptClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false,
});

receiptClient.interceptors.request.use((config) => {
  const raw = localStorage.getItem("token") || "";
  const token = raw.startsWith("Bearer ") ? raw.slice(7) : raw; // กัน "Bearer Bearer ..."
  if (token) {
    // ให้แน่ใจว่า headers เป็น AxiosHeaders (ตาม Axios v1)
    if (!config.headers) {
      config.headers = new AxiosHeaders();
    } else if (!(config.headers instanceof AxiosHeaders)) {
      config.headers = new AxiosHeaders(config.headers as any);
    }
    (config.headers as AxiosHeaders).set("Authorization", `Bearer ${token}`);
  }
  return config;
});

// ---------- Helper ----------
const safeMessage = (err: unknown, fallback = "เกิดข้อผิดพลาด") => {
  const e = err as AxiosError<any>;
  return (
    e?.response?.data?.message ||
    (typeof e?.message === "string" ? e.message : "") ||
    fallback
  );
};

// ---------- APIs ----------

// ดึงรายการใบเสร็จทั้งหมด
export const fetchReceipts = async () => {
  try {
    const { data } = await receiptClient.get("/receipts/getReceipt");
    return data?.success ? data.receipts : [];
  } catch (error) {
    console.error("Error fetching receipts:", error);
    return [];
  }
};

// ดึงข้อมูลใบเสร็จตาม paymentId หรือ saleId (แบ็กเอนด์รองรับทั้งสองแบบ)
export async function fetchReceiptById(paymentId: string) {
  try {
    const { data } = await receiptClient.get(`/receipts/paymentId/${paymentId}`);
    return data;
  } catch (error) {
    throw new Error(safeMessage(error, "เกิดข้อผิดพลาด"));
  }
}

// ลบใบเสร็จตาม paymentId
export const deleteReceipt = async (paymentId: string) => {
  try {
    const res = await receiptClient.delete(`/receipts/${paymentId}`);
    return res.status === 200;
  } catch (error) {
    console.error("Error deleting receipt:", error);
    return false;
  }
};

// สรุปยอดขาย (แดชบอร์ด)
export const fetchSalesSummary = async (
  date: Date,
  filter: "daily" | "weekly" | "monthly"
) => {
  try {
    const { data } = await receiptClient.get("/dashboard/stats", {
      params: { date: date.toISOString(), filter },
    });
    return data;
  } catch (error) {
    console.error("Error fetching sales summary:", error);
    return { success: false, data: null };
  }
};

// ✅ ดึงใบเสร็จจาก saleId (สำหรับคืนสินค้า)
export const fetchReceiptBySaleId = async (saleId: string) => {
  try {
    const { data } = await receiptClient.get(`/receipts/receipt/${saleId}`);
    return data;
  } catch (error) {
    console.error("Error fetching receipt by saleId:", error);
    return { success: false, message: "ไม่สามารถดึงข้อมูลใบเสร็จได้" };
    // หรือ throw ใหม่: throw new Error(safeMessage(error));
  }
};