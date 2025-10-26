import { Request, Response } from "express";
import StockTransaction from "../models/StockTransaction";
import Stock from "../models/Stock";
import Product from "../models/Product";
import { verifyToken } from "../utils/auth";
import User from "../models/User";
import Employee from "../models/Employee";

const getOwnerId = async (userId: string): Promise<string> => {
    let user = await User.findById(userId) || await Employee.findById(userId);
    if (!user) throw new Error("User not found");
    if (user.role === "admin") return user._id.toString();
    if (user.role === "employee") {
        if (!user.adminId) throw new Error("Employee does not have admin assigned");
        return user.adminId.toString();
    }
    throw new Error("Invalid user role");
};

// 🧩 สร้าง Transaction ใหม่ (ขาย / รับเข้า / คืน / ปรับยอด)
export const createTransaction = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.headers["authorization"]?.split(" ")[1];
        if (!token) { res.status(401).json({ success: false, message: "No token provided" }); return; }

        const decoded = verifyToken(token);
        if (typeof decoded === "string" || !("userId" in decoded)) {
            res.status(401).json({ success: false, message: "Invalid token" }); return;
        }
        const ownerId = await getOwnerId(decoded.userId);

        const { stockId, stockLotId, productId, qcReference, source, type, quantity, referenceId, costPrice, salePrice, notes } = req.body;

        // ✅ ตรวจสอบ stock & product ต้องเป็นของ owner
        const stock = await Stock.findOne({ _id: stockId, userId: ownerId });
        if (!stock) { res.status(404).json({ success: false, message: "Stock not found" }); return; }

        const product = await Product.findOne({ _id: productId, userId: ownerId });
        if (!product) { res.status(404).json({ success: false, message: "Product not found" }); return; }

        // ✅ ปรับจำนวนตามประเภท
        if (type === "SALE") {
            if (stock.quantity < quantity) {
                res.status(400).json({ success: false, message: `สินค้าในสต็อกไม่เพียงพอ (เหลือ ${stock.quantity})` });
                return;
            }
            stock.quantity -= quantity;
        } else if (type === "RESTOCK" || type === "RETURN") {
            stock.quantity += quantity;
        } else if (type === "ADJUSTMENT") {
            stock.quantity = quantity;
        }

        // ✅ ประเมินสถานะ
        if (stock.quantity <= 0) stock.status = "สินค้าหมด";
        else if (stock.quantity <= stock.threshold) stock.status = "สินค้าเหลือน้อย";
        else stock.status = "สินค้าพร้อมขาย";

        await stock.save();

        const transaction = new StockTransaction({
            stockId,
            stockLotId,
            productId,
            type,
            quantity,
            referenceId,
            qcReference,
            userId: ownerId, // ✅ ผูก owner เสมอ
            costPrice: costPrice ?? stock.costPrice ?? product.price,
            salePrice: salePrice ?? stock.salePrice ?? product.price,
            source: source || "SELF",
            notes,
        });

        await transaction.save();

        res.status(201).json({
            success: true,
            message: "สร้าง Transaction สำเร็จ และอัปเดตสถานะสินค้าเรียบร้อย ✅",
            data: { transaction, updatedStock: stock },
        });
    } catch (error: any) {
        console.error("❌ Create Transaction Error:", error);
        res.status(500).json({ success: false, message: "Server error while creating transaction", error });
    }
};

//  ดึงประวัติ Transaction ทั้งหมด
export const getAllTransactions = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.headers["authorization"]?.split(" ")[1];
        if (!token) { res.status(401).json({ success: false, message: "No token provided" }); return; }
        const decoded = verifyToken(token);
        if (typeof decoded === "string" || !("userId" in decoded)) {
            res.status(401).json({ success: false, message: "Invalid token" }); return;
        }
        const ownerId = await getOwnerId(decoded.userId);

        const transactions = await StockTransaction.find({ userId: ownerId })
            .populate({ path: "stockId", populate: { path: "location", model: "Warehouse" } })
            .populate("productId")
            .populate("stockLotId")
            .populate("qcReference")
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: transactions });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};



//  ดึง Transaction ตามสินค้า
export const getTransactionsByProduct = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.headers["authorization"]?.split(" ")[1];
        if (!token) { res.status(401).json({ success: false, message: "No token provided" }); return; }
        const decoded = verifyToken(token);
        if (typeof decoded === "string" || !("userId" in decoded)) {
            res.status(401).json({ success: false, message: "Invalid token" }); return;
        }
        const ownerId = await getOwnerId(decoded.userId);

        const transactions = await StockTransaction.find({ productId: req.params.productId, userId: ownerId })
            .populate("stockId")
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: transactions });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};


//  ดึง Transaction ตาม Stock
export const getTransactionsByStock = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.headers["authorization"]?.split(" ")[1];
        if (!token) { res.status(401).json({ success: false, message: "No token provided" }); return; }
        const decoded = verifyToken(token);
        if (typeof decoded === "string" || !("userId" in decoded)) {
            res.status(401).json({ success: false, message: "Invalid token" }); return;
        }
        const ownerId = await getOwnerId(decoded.userId);

        const transactions = await StockTransaction.find({ stockId: req.params.stockId, userId: ownerId })
            .populate("productId")
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: transactions });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};