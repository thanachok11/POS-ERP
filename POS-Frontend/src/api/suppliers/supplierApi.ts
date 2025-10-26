import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL;

// ✅ เพิ่มซัพพลายเออร์ใหม่
export const addSupplier = async (supplierData: any, token: string) => {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/suppliers/create`,
            supplierData,
            {
                headers: { Authorization: `Bearer ${token}` },
            }
        );
        return response.data;
    } catch (error: any) {
        console.error("❌ addSupplier Error:", error);
        throw error.response?.data || { message: "เกิดข้อผิดพลาดในการเพิ่มซัพพลายเออร์" };
    }
};

// ✅ ดึงข้อมูลซัพพลายเออร์ทั้งหมด
export const getSupplierData = async (token: string | null) => {
    if (!token) return [];
    try {
        const response = await axios.get(`${API_BASE_URL}/suppliers`, {
        headers: { Authorization: `Bearer ${token}` },
        // 👇 ทำให้ 401/403 ไม่ถูก reject (interceptor ฝั่ง error จะไม่ทำงาน)
        validateStatus: () => true,
        });

        if (response.status === 401 || response.status === 403) {
        return []; // employee ไม่มีสิทธิ์ → ไม่ต้องเด้ง login
        }
        return response.data?.data ?? [];
    } catch (err) {
        console.error("❌ getSupplierData Error:", err);
        return []; // กันไม่ให้ bubble ไปถึง interceptor
    }
};

// ✅ ดึงข้อมูลซัพพลายเออร์ตาม ID
export const getSupplierById = async (id: string, token: string) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/suppliers/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return response.data;
    } catch (error: any) {
        console.error("❌ getSupplierById Error:", error);
        throw error.response?.data || { message: "เกิดข้อผิดพลาดในการดึงข้อมูลซัพพลายเออร์" };
    }
};

// ✅ อัปเดตซัพพลายเออร์ (PATCH)
export const updateSupplier = async (id: string, supplierData: any, token: string) => {
    try {
        const response = await axios.patch(
            `${API_BASE_URL}/suppliers/${id}`,
            supplierData,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return response.data;
    } catch (error: any) {
        console.error("❌ updateSupplier Error:", error);
        throw error.response?.data || { message: "เกิดข้อผิดพลาดในการอัปเดตซัพพลายเออร์" };
    }
};

// ✅ ลบซัพพลายเออร์
export const deleteSupplier = async (id: string, token: string) => {
    try {
        const response = await axios.delete(`${API_BASE_URL}/suppliers/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return response.data;
    } catch (error: any) {
        console.error("❌ deleteSupplier Error:", error);
        throw error.response?.data || { message: "เกิดข้อผิดพลาดในการลบซัพพลายเออร์" };
    }
};

// ✅ ดึงสินค้าพร้อม stock ตาม supplier
export const getProductsBySupplier = async (supplierId: string, token: string) => {
    try {
        const response = await axios.get(
            `${API_BASE_URL}/suppliers/${supplierId}/products-with-stock`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return response.data;
    } catch (error: any) {
        console.error("❌ getProductsBySupplier Error:", error);
        throw error.response?.data || { message: "เกิดข้อผิดพลาดในการดึงสินค้าจากซัพพลายเออร์" };
    }
};
