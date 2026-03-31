import { jwtDecode } from "jwt-decode";

/**
 * ตรวจสอบว่า JWT Token ถูกต้องและยังไม่หมดอายุ
 * @param token Token ที่ต้องการตรวจสอบ
 * @returns boolean
 */
export const isTokenValid = (token: string | null): boolean => {
  if (!token) return false;
  try {
    const decoded: any = jwtDecode(token);
    const currentTime = Date.now() / 1000;
    return decoded.exp > currentTime;
  } catch {
    return false;
  }
};

/**
 * ตรวจสอบว่า JWT Token กำลังจะหมดอายุภายในระยะเวลาที่กำหนดหรือไม่
 * @param token Token ที่ต้องการตรวจสอบ
 * @param bufferSeconds ระยะเวลาเผื่อ (วินาที) (ค่าเริ่มต้น 60 วินาที)
 * @returns boolean
 */
export const isTokenExpiringSoon = (token: string | null, bufferSeconds = 60): boolean => {
  if (!token) return true;
  try {
    const decoded: any = jwtDecode(token);
    const currentTime = Date.now() / 1000;
    return decoded.exp - currentTime < bufferSeconds;
  } catch {
    return true;
  }
};
