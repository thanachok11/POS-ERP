import { Request, Response } from "express";
import Discount from "../models/Discount";
import { verifyToken } from "../utils/auth";

// ✅ สร้างรหัสส่วนลดใหม่ (เฉพาะ admin / manager)
export const createDiscount = async (req: Request, res: Response): Promise<void> => {
    const token = req.headers["authorization"]?.split(" ")[1];

    if (!token) {
        res.status(401).json({ success: false, message: "No token provided" });
        return;
    }

    try {
        const decoded = verifyToken(token);

        if (typeof decoded !== "string" && "userId" in decoded) {
            // ✅ หา user จาก token
            const User = require("../models/User").default;
            const user = await User.findById(decoded.userId);

            if (!user) {
                res.status(404).json({ success: false, message: "User not found" });
                return;
            }

            if (user.role !== "admin" && user.role !== "manager") {
                res.status(403).json({
                    success: false,
                    message: "Forbidden: Only admin or manager can create discounts",
                });
                return;
            }

            // ✅ ดึงข้อมูลจาก body
            const { code, type, value, description, startDate, endDate } = req.body;

            const exists = await Discount.findOne({ code });
            if (exists) {
                res.status(400).json({ success: false, message: "โค้ดนี้ถูกใช้งานแล้ว" });
                return;
            }

            const discount = await Discount.create({
                userId: decoded.userId,
                code: code.toUpperCase(),
                type,
                value,
                description,
                startDate,
                endDate,
            });

            res.status(201).json({
                success: true,
                message: "สร้างรหัสส่วนลดสำเร็จ",
                data: discount,
            });
        } else {
            res.status(401).json({ success: false, message: "Invalid token" });
        }
    } catch (error) {
        console.error("❌ createDiscount error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create discount",
            error,
        });
    }
};

// ✅ ดึงรหัสส่วนลดทั้งหมด
export const getDiscounts = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.headers["authorization"]?.split(" ")[1];
        if (!token) {
            res.status(401).json({ success: false, message: "No token provided" });
            return;
        }

        const decoded = verifyToken(token);
        if (typeof decoded !== "string" && "userId" in decoded) {
            const userId = decoded.userId;

            // ✅ ดึงเฉพาะส่วนลดของ user นี้
            const discounts = await Discount.find({ userId }).sort({ createdAt: -1 });

            res.status(200).json({
                success: true,
                message: "ดึงรหัสส่วนลดของผู้ใช้สำเร็จ",
                data: discounts,
            });
        } else {
            res.status(401).json({ success: false, message: "Invalid token" });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "ไม่สามารถดึงข้อมูลได้",
            error,
        });
    }
};

// ✅ ลบรหัสส่วนลด (เฉพาะ admin / manager)
export const deleteDiscount = async (req: Request, res: Response): Promise<void> => {
    const token = req.headers["authorization"]?.split(" ")[1];

    if (!token) {
        res.status(401).json({ success: false, message: "No token provided" });
        return;
    }

    try {
        const decoded = verifyToken(token);

        if (typeof decoded !== "string" && "userId" in decoded) {
            const User = require("../models/User").default;
            const user = await User.findById(decoded.userId);

            if (!user) {
                res.status(404).json({ success: false, message: "User not found" });
                return;
            }

            if (user.role !== "admin" && user.role !== "manager") {
                res.status(403).json({
                    success: false,
                    message: "Forbidden: Only admin or manager can delete discounts",
                });
                return;
            }

            await Discount.findByIdAndDelete(req.params.id);
            res.status(200).json({
                success: true,
                message: "ลบรหัสส่วนลดเรียบร้อย",
            });
        } else {
            res.status(401).json({ success: false, message: "Invalid token" });
        }
    } catch (error) {
        console.error("❌ deleteDiscount error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete discount",
            error,
        });
    }
};

// ✅ ตรวจสอบโค้ดส่วนลด (ใช้ตอน Checkout - ไม่ต้องมี token)
export const validateDiscount = async (req: Request, res: Response): Promise<void> => {
    try {
        const { code } = req.body;

        const discount = await Discount.findOne({
            code: code.toUpperCase(),
            isActive: true,
        });

        if (!discount) {
            res.status(404).json({ success: false, message: "ไม่พบโค้ดส่วนลดนี้" });
            return;
        }

        const now = new Date();
        if (discount.startDate && now < discount.startDate) {
            res.status(400).json({ success: false, message: "โค้ดยังไม่เริ่มใช้งาน" });
            return;
        }
        if (discount.endDate && now > discount.endDate) {
            res.status(400).json({ success: false, message: "โค้ดหมดอายุแล้ว" });
            return;
        }

        res.status(200).json({
            success: true,
            message: "โค้ดถูกต้อง",
            data: discount,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "ตรวจสอบโค้ดล้มเหลว",
            error,
        });
    }
};

// ✅ แก้ไขรหัสส่วนลด (เฉพาะ admin / manager)
export const updateDiscount = async (req: Request, res: Response): Promise<void> => {
    const token = req.headers["authorization"]?.split(" ")[1];

    if (!token) {
        res.status(401).json({ success: false, message: "No token provided" });
        return;
    }

    try {
        const decoded = verifyToken(token);

        if (typeof decoded !== "string" && "userId" in decoded) {
            const User = require("../models/User").default;
            const user = await User.findById(decoded.userId);

            if (!user) {
                res.status(404).json({ success: false, message: "User not found" });
                return;
            }

            if (user.role !== "admin" && user.role !== "manager") {
                res.status(403).json({
                    success: false,
                    message: "Forbidden: Only admin or manager can update discounts",
                });
                return;
            }

            const { id } = req.params;
            const { code, type, value, description, startDate, endDate, isActive } = req.body;

            // ✅ ตรวจสอบว่ามีส่วนลดอยู่หรือไม่
            const discount = await Discount.findById(id);
            if (!discount) {
                res.status(404).json({ success: false, message: "ไม่พบรหัสส่วนลดนี้" });
                return;
            }

            // ✅ ป้องกันการใช้โค้ดซ้ำ (ยกเว้นโค้ดเดิมของตัวเอง)
            const duplicate = await Discount.findOne({
                code: code.toUpperCase(),
                _id: { $ne: id },
            });
            if (duplicate) {
                res.status(400).json({
                    success: false,
                    message: "โค้ดส่วนลดนี้ถูกใช้งานแล้ว",
                });
                return;
            }

            // ✅ อัปเดตข้อมูล
            discount.code = code.toUpperCase();
            discount.type = type;
            discount.value = value;
            discount.description = description;
            discount.startDate = startDate;
            discount.endDate = endDate;
            if (typeof isActive === "boolean") discount.isActive = isActive;

            await discount.save();

            res.status(200).json({
                success: true,
                message: "อัปเดตรหัสส่วนลดสำเร็จ",
                data: discount,
            });
        } else {
            res.status(401).json({ success: false, message: "Invalid token" });
        }
    } catch (error) {
        console.error("❌ updateDiscount error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update discount",
            error,
        });
    }
};