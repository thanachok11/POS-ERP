import { Request, Response } from "express";
import mongoose from "mongoose";
import StockLot from "../models/StockLot";
import Product from "../models/Product";
import User from "../models/User";
import Employee from "../models/Employee";
import { verifyToken } from "../utils/auth";

/* =========================
   🔑 resolve ownerId (string)
========================= */
const getOwnerId = async (userId: string): Promise<string> => {
    let user: any = await User.findById(userId);
    if (!user) user = await Employee.findById(userId);
    if (!user) throw new Error("User not found");

    if (user.role === "admin") return user._id.toString();
    if (user.role === "employee") {
        if (!user.adminId) throw new Error("Employee does not have admin assigned");
        return user.adminId.toString();
    }
    throw new Error("Invalid user role");
};

// ให้ query ติด owner ได้ทั้งกรณีเก็บเป็น string หรือ ObjectId
const ownerScope = (ownerId: string) => ({
    $or: [{ userId: ownerId }, { userId: new mongoose.Types.ObjectId(ownerId) }],
});

/* ===================================================
   📦 ดึง StockLot ทั้งหมดของ owner (เฉพาะที่ยังไม่ปิดล็อต)
=================================================== */
export const getStockLots = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.header("Authorization")?.split(" ")[1];
        if (!token) {
            res.status(401).json({ success: false, message: "Unauthorized, no token provided" });
            return;
        }

        const decoded = verifyToken(token);
        if (typeof decoded === "string" || !("userId" in decoded)) {
            res.status(401).json({ success: false, message: "Invalid token" });
            return;
        }

        const ownerId = await getOwnerId((decoded as any).userId);

        const stockLots = await StockLot.find({
            ...ownerScope(ownerId),
            isClosed: false,   
            isActive: true     
        })
            .populate({
                path: "productId",
                populate: { path: "category" }
            })
            .populate("supplierId", "companyName")
            .populate("location")
            .sort({ updatedAt: -1 });

        res.status(200).json({
            success: true,
            data: stockLots
        });

    } catch (error) {
        console.error("Get StockLots Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error while fetching stock lots"
        });
    }
};

/* ===================================================
   🔎 กรองล็อตสินค้า (ด้วย owner)
=================================================== */
export const filterStockLots = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.header("Authorization")?.split(" ")[1];
        if (!token) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }

        const decoded = verifyToken(token);
        if (typeof decoded === "string" || !("userId" in decoded)) {
            res.status(401).json({ success: false, message: "Invalid token" }); return;
        }

        const ownerId = await getOwnerId((decoded as any).userId);
        const { status, qcStatus, warehouseId, supplierId } = req.query;

        const filter: any = { ...ownerScope(ownerId) };
        if (status) filter.status = status;
        if (qcStatus) filter.qcStatus = qcStatus;
        if (warehouseId) filter.location = warehouseId;
        if (supplierId) filter.supplierId = supplierId;

        const stockLots = await StockLot.find(filter)
            .populate("productId")
            .populate("supplierId", "companyName")
            .populate("location", "name")
            .sort({ updatedAt: -1 });

        res.status(200).json({ success: true, data: stockLots });
    } catch (error) {
        console.error("Filter StockLot Error:", error);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการกรองล็อตสินค้า" });
    }
};

/* ===================================================
   🔍 ค้นหา StockLot ด้วย Barcode (สินค้าเดียว) + สรุป
=================================================== */
export const getStockLotsByBarcode = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.header("Authorization")?.split(" ")[1];
        if (!token) { res.status(401).json({ success: false, message: "Unauthorized, no token provided" }); return; }

        const decoded = verifyToken(token);
        if (typeof decoded === "string" || !("userId" in decoded)) {
            res.status(401).json({ success: false, message: "Invalid token" }); return;
        }

        const ownerId = await getOwnerId((decoded as any).userId);
        const { barcode } = req.params;

        const product = await Product.findOne({ barcode });
        if (!product) { res.status(404).json({ success: false, message: "ไม่พบสินค้าในระบบ" }); return; }

        const stockLots = await StockLot.find({ productId: product._id, ...ownerScope(ownerId) })
            .populate("supplierId", "companyName")
            .populate("location", "name")
            .sort({ createdAt: -1 });

        const totalQuantity = stockLots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);

        res.status(200).json({
            success: true,
            product: {
                _id: product._id,
                name: product.name,
                barcode: product.barcode,
                imageUrl: product.imageUrl,
                salePrice: product.salePrice,
                costPrice: product.costPrice,
            },
            totalLots: stockLots.length,
            totalQuantity,
            lots: stockLots,
        });
    } catch (error) {
        console.error("Get StockLotsByBarcode Error:", error);
        res.status(500).json({ success: false, message: "Server error while fetching stock lots by barcode" });
    }
};

/* ===================================================
   🗓️ อัปเดตวันหมดอายุ (เช็คสิทธิ์ด้วย owner)
=================================================== */
export const updateExpiryDate = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.header("Authorization")?.split(" ")[1];
        if (!token) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }

        const decoded = verifyToken(token);
        if (typeof decoded === "string" || !("userId" in decoded)) {
            res.status(401).json({ success: false, message: "Invalid token" }); return;
        }
        const ownerId = await getOwnerId((decoded as any).userId);

        const { lotId } = req.params;
        const { expiryDate } = req.body;

        const lot = await StockLot.findOne({ _id: lotId, ...ownerScope(ownerId) });
        if (!lot) { res.status(404).json({ success: false, message: "ไม่พบล็อตสินค้าที่ต้องการอัปเดต" }); return; }

        lot.expiryDate = expiryDate;
        await lot.save();

        res.status(200).json({ success: true, message: "อัปเดตวันหมดอายุสำเร็จ", data: lot });
    } catch (error) {
        console.error("Update Expiry Date Error:", error);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการอัปเดตวันหมดอายุ" });
    }
};

/* ===================================================
   🧪 อัปเดตสถานะ QC (เช็คสิทธิ์ด้วย owner)
=================================================== */
export const updateQCStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.header("Authorization")?.split(" ")[1];
        if (!token) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }

        const decoded = verifyToken(token);
        if (typeof decoded === "string" || !("userId" in decoded)) {
            res.status(401).json({ success: false, message: "Invalid token" }); return;
        }
        const ownerId = await getOwnerId((decoded as any).userId);

        const { lotId } = req.params;
        const { qcStatus, notes } = req.body;

        const lot = await StockLot.findOne({ _id: lotId, ...ownerScope(ownerId) });
        if (!lot) { res.status(404).json({ success: false, message: "ไม่พบล็อตสินค้า" }); return; }

        lot.qcStatus = qcStatus;
        lot.notes = notes;
        await lot.save();

        res.status(200).json({ success: true, message: `อัปเดตสถานะ QC เป็น "${qcStatus}" สำเร็จ`, data: lot });
    } catch (error) {
        console.error("Update QC Error:", error);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการอัปเดตสถานะ QC" });
    }
};

/* ===================================================
   🚫 ปิดล็อตสินค้า (Deactivate) — เช็คสิทธิ์ + เก็บรอยเท้า
=================================================== */
export const deactivateStockLot = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.header("Authorization")?.split(" ")[1];
        if (!token) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }

        const decoded = verifyToken(token);
        if (typeof decoded === "string" || !("userId" in decoded)) {
            res.status(401).json({ success: false, message: "Invalid token" }); return;
        }

        const ownerId = await getOwnerId((decoded as any).userId);

        const { lotId } = req.params;
        const { reason = "พบสินค้าชำรุดหลัง QC" } = req.body;

        const lot = await StockLot.findOne({ _id: lotId, ...ownerScope(ownerId) });
        if (!lot) {
            res.status(404).json({ success: false, message: "ไม่พบล็อตสินค้าที่ต้องการปิด" });
            return;
        }

        if (!lot.isActive) {
            res.status(400).json({ success: false, message: "ล็อตนี้ถูกปิดไปแล้ว" });
            return;
        }

        lot.isActive = false;
        lot.isClosed = true;
        lot.status = "ปิดล็อต";      
        lot.reason = reason;     
        lot.closedBy = decoded.userId;
        lot.closedAt = new Date();

        await lot.save();

        res.status(200).json({
            success: true,
            message: "✅ ปิดล็อตสำเร็จ",
            data: {
                lotId: lot._id,
                batchNumber: lot.batchNumber,
                status: lot.status,
                reason: lot.reason,
                remainingQty: lot.remainingQty,
            },
        });
    } catch (error) {
        console.error("Deactivate StockLot Error:", error);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการปิดล็อต" });
    }
};
