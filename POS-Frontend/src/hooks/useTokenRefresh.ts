import { useEffect } from "react";
import { renewToken } from "../api/auth/auth";
import { isTokenExpiringSoon } from "../utils/authUtils";

const COOLDOWN_MS = 5 * 60 * 1000; // คูลดาวน์ 5 นาทีระหว่างการต่ออายุแต่ละครั้ง

/**
 * Hook สำหรับระบุการต่ออายุ Token อัตโนมัติเมื่อมีการใช้งาน (Activity)
 * ตรวจจับการเคลื่อนไหวของเมาส์และการกดปุ่มเพื่อเริ่มการต่ออายุหาก Token กำลังจะหมดอายุ
 */
export const useTokenRefresh = () => {
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let lastRenewTime = 0;

    const activityDetected = async () => {
      clearTimeout(timeoutId);
      const token = localStorage.getItem("token");
      const now = Date.now();
      
      const enoughTimePassed = now - lastRenewTime > COOLDOWN_MS;
      const tokenIsExpiring = isTokenExpiringSoon(token, 60);

      // ต่ออายุหาก Token ใกล้จะหมดอายุและผ่านช่วงคูลดาวน์มาแล้ว
      if (token && tokenIsExpiring && enoughTimePassed) {
        try {
          const newToken = await renewToken(token);
          if (newToken) {
            localStorage.setItem("token", newToken);
            lastRenewTime = Date.now();
            console.log("ต่ออายุ Token สำเร็จ");
          }
        } catch (error) {
          console.error("การต่ออายุ Token ล้มเหลว:", error);
        }
      }

      timeoutId = setTimeout(() => {}, COOLDOWN_MS);
    };

    // เพิ่มตัวตรวจจับ Activity
    window.addEventListener("mousemove", activityDetected);
    window.addEventListener("keydown", activityDetected);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("mousemove", activityDetected);
      window.removeEventListener("keydown", activityDetected);
    };
  }, []);
};
