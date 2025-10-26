import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL;

// ✅ ฟังก์ชันสร้างการชำระเงิน (ขาย / คืน)
const payloadFromToken = () => {
    const t = localStorage.getItem("token") || localStorage.getItem("authToken") || "";
    try {
        if (!t || !t.includes(".")) return null;
        return JSON.parse(atob(t.split(".")[1]));
    } catch { return null; }
};

export const createPayment = async (paymentData: {
    saleId?: string;
    employeeName?: string;
    paymentMethod: "เงินสด" | "โอนเงิน" | "บัตรเครดิต" | "QR Code";
    amountReceived: number;
    amount?: number;
    change?: number;
    discount?: number;
    items: Array<{ barcode: string; name: string; price: number; quantity?: number; totalQuantity?: number; subtotal?: number; }>;
    isReturn?: boolean;
    reason?: string;
}) => {
    try {
        const token = localStorage.getItem("token") || localStorage.getItem("authToken") || "";
        const payload = payloadFromToken();

        // ✅ เติมชื่อพนักงานให้แน่
        const safeEmployeeName =
            paymentData.employeeName ||
            (payload?.username ?? payload?.name ?? payload?.email ?? "Employee");

        // ✅ เติม saleId ถ้าไม่ได้ส่งมา
        const safeSaleId = paymentData.saleId || `SALE-${Date.now()}`;

        // ✅ map items ให้มี quantity & subtotal เสมอ (เผื่อคุณส่ง totalQuantity มา)
        const fixedItems = (paymentData.items || []).map((it) => {
            const qty = it.quantity ?? it.totalQuantity ?? 1;
            const sub = it.subtotal ?? Number(it.price || 0) * Number(qty || 0);
            return { ...it, quantity: qty, subtotal: sub };
        });

        const body = {
            ...paymentData,
            saleId: safeSaleId,
            employeeName: safeEmployeeName,
            items: fixedItems,
        };

        const res = await axios.post(`${API_BASE_URL}/payment/create`, body, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return res.data;
    } catch (error) {
        console.error("❌ createPayment Error:", error);
        return { success: false, message: "เกิดข้อผิดพลาดในการสร้างการชำระเงิน" };
    }
};


// ✅ ดึงข้อมูลการชำระเงินของออเดอร์
export const getPaymentByOrderId = async (orderId: string) => {
    try {
        const token = localStorage.getItem("token");
        const res = await axios.get(`${API_BASE_URL}/payment/order/${orderId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return res.data;
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการดึงข้อมูลการชำระเงิน:", error);
        return { success: false, message: "ไม่พบข้อมูลการชำระเงิน" };
    }
};

// ✅ ดึงใบเสร็จจาก Payment
export const getReceiptByPaymentId = async (paymentId: string) => {
    try {
        const token = localStorage.getItem("token");
        const res = await axios.get(`${API_BASE_URL}/payment/receipt/${paymentId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return res.data;
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการดึงข้อมูลใบเสร็จ:", error);
        return { success: false, message: "ไม่พบข้อมูลใบเสร็จ" };
    }
};

// ✅ ดึงข้อมูลการชำระเงินทั้งหมด
export const getAllPayments = async () => {
    try {
        const token = localStorage.getItem("token");
        const res = await axios.get(`${API_BASE_URL}/payment/getPayment`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return res.data;
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการดึงข้อมูลการชำระเงินทั้งหมด:", error);
        return { success: false, message: "ไม่พบข้อมูลการชำระเงิน" };
    }
};

// ✅ ดึงข้อมูลใบเสร็จทั้งหมด
export const getAllReceipts = async () => {
    try {
        const token = localStorage.getItem("token");
        const res = await axios.get(`${API_BASE_URL}/receipts/getReceipt`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return res.data;
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการดึงข้อมูลใบเสร็จทั้งหมด:", error);
        return { success: false, message: "ไม่พบข้อมูลใบเสร็จ" };
    }
};

// ✅ คืนสินค้าทั้งใบ
export const refundByReceipt = async (
    saleId: string,
    reason?: string,
    paymentMethod?: string,
    items?: any[]
) => {
    try {
        const token = localStorage.getItem("token");
        const response = await axios.post(
            `${API_BASE_URL}/payment/refund`,
            { saleId, reason, paymentMethod, items },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );

        return response.data;
    } catch (error: any) {
        console.error("❌ Error refundByReceipt:", error.response?.data || error.message);
        return {
            success: false,
            message: error.response?.data?.message || "เกิดข้อผิดพลาดในการคืนสินค้า",
        };
    }
};