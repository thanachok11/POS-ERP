import axios from "axios";

// Base URL ของ API
const API_BASE_URL = import.meta.env.VITE_API_URL;

// ฟังก์ชันเพื่อดึงรายการสินค้าทั้งหมด
export const getProducts = async () => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('No token found');

  const response = await axios.get(
    `${API_BASE_URL}/products/Product?onlyAvailable=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};


// ฟังก์ชันเพื่อดึงสินค้าโดยใช้ barcode
export const getProductByBarcode = async (barcode: string) => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('No token found');

  console.log("Fetching product with barcode:", barcode); // Log the barcode
  try {
    const response = await axios.get(`${API_BASE_URL}/products/barcode/${barcode}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    console.log("API response:", response.data); // Log the full response data
    return response.data;
  } catch (error) {
    console.error("Error fetching product by barcode:", error);
    throw error;
  }
};



// ฟังก์ชันสำหรับอัปโหลดสินค้าใหม่ (จากตัวอย่างก่อนหน้า)
export const uploadProduct = async (formData: FormData, token: string | null) => {
  try {
    const response = await axios.post((`${API_BASE_URL}/product/upload`), formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`, // Include token in the Authorization header
        },
      }
    );
    return response;
  } catch (error) {
    throw error;
  }
};

// ✅ อัปโหลดและอัปเดตข้อมูลสินค้า (รวมรูปภาพ)
export const updateProductImage = async (
  productId: string,
  formData: FormData,
  token: string | null
) => {
  try {
    const response = await axios.patch(
      `${API_BASE_URL}/product/${productId}/update-image`, // ✅ ชี้ไป endpoint ที่มี id
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("❌ updateProductImage error:", error);
    throw error;
  }
};



export const updateProduct = async (id: string, updateData: any) => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('No token found');

  try {
    const response = await axios.patch(`${API_BASE_URL}/products/${id}`, updateData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error("Error updating product:", error);
    throw error;
  }
};

export const deleteProduct = async (id: string) => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('No token found');

  try {
    const response = await axios.delete(`${API_BASE_URL}/products/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error("Error deleting product:", error);
    throw error;
  }
};


export const placeOrder = async (orderData: any) => {
  return await axios.post(`${API_BASE_URL}/checkout`, orderData);
};




