// api/auth.ts
import axios, { AxiosError } from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL as string;

// ---------- axios instance ----------
const authClient = axios.create({
  baseURL: API_BASE_URL,
});

// ---------- helpers ----------
const saveSession = (token?: string | null, nameStore?: string, role?: string) => {
  if (token) localStorage.setItem("token", token);
  if (nameStore) localStorage.setItem("nameStore", nameStore);
  if (role) localStorage.setItem("role", role);
};

export const getAuthToken = () => localStorage.getItem("token") || "";

// decode JWT (แบบง่าย ไม่ตรวจ signature)
export const getAuthUser = (): null | {
  userId?: string;
  email?: string;
  username?: string;
  firstname?: string;
  lastname?: string;
  role?: string;
  nameStore?: string;
  adminId?: string;
  position?: string;
  status?: string;
  profile_img?: string;
} => {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const [, payload] = token.split(".");
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json || null;
  } catch {
    return null;
  }
};

const errorMessage = (e: unknown, fallback = "เกิดข้อผิดพลาด") => {
  const err = e as AxiosError<any>;
  return (
    err?.response?.data?.message ||
    (typeof err?.message === "string" ? err.message : "") ||
    fallback
  );
};

// ---------- APIs ----------

// สมัครสมาชิก
export const registerUser = async (
  email: string,
  password: string,
  username: string,
  firstName: string,
  lastName: string,
  nameStore: string
) => {
  try {
    const { data } = await authClient.post("/auth/register", {
      nameStore,
      email,
      password,
      username,
      firstName,
      lastName,
    });
    return data;
  } catch (e) {
    throw new Error(errorMessage(e, "Registration failed"));
  }
};

// ล็อกอิน (admin/employee)
export const loginUser = async (email: string, password: string) => {
  try {
    const { data } = await authClient.post("/auth/login", { email, password });
    // backend ส่ง { message, token, role, nameStore }
    saveSession(data?.token, data?.nameStore, data?.role);
    return data;
  } catch (e) {
    throw new Error(errorMessage(e, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"));
  }
};

// ต่ออายุ token (และอัปเดต nameStore ด้วย ถ้ามี)
export const renewToken = async (token?: string | null) => {
  try {
    const useToken = token ?? getAuthToken();
    const { data } = await authClient.post(
      "/auth/renew-token",
      {},
      { headers: { Authorization: `Bearer ${useToken}` } }
    );
    // backend ส่ง { token, nameStore }
    saveSession(data?.token, data?.nameStore, localStorage.getItem("role") || undefined);
    return data?.token as string;
  } catch (e) {
    console.error("❌ renewToken error:", e);
    return null;
  }
};

// สมัครด้วย Google
export const handleGoogleRegister = async (googleToken: string) => {
  try {
    const { data } = await authClient.post("/auth/google-register", { googleToken });
    // คาดหวัง { token, role, nameStore }
    saveSession(data?.token, data?.nameStore, data?.role);
    return data;
  } catch (e) {
    console.error("Register Error:", e);
    throw e;
  }
};

// ล็อกอินด้วย Google (ปรับ path ให้สอดคล้อง /auth/google-login)
export const googleLogin = async (googleToken: string) => {
  try {
    const { data } = await authClient.post("/auth/google-login", { googleToken });
    // คาดหวัง { token, role, nameStore }
    saveSession(data?.token, data?.nameStore, data?.role);
    return data;
  } catch (e) {
    throw new Error(errorMessage(e, "Login failed"));
  }
};

// ถ้าใช้ One Tap และ backend ที่ /auth/google/callback
export const handleSuccess = async (response: any) => {
  try {
    const { data } = await authClient.post("/auth/google/callback", {
      token: response?.credential,
    });
    // คาดหวัง { token, role, nameStore }
    saveSession(data?.token, data?.nameStore, data?.role);
    return data;
  } catch (e) {
    console.error("Error verifying token with backend:", e);
    throw e;
  }
};

// ออกจากระบบ
export const logoutUser = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("nameStore");
  localStorage.removeItem("role");
  console.log("✅ User logged out successfully");
};