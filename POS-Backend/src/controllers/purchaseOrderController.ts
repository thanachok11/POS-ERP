// controllers/purchaseOrderController.ts
import { Request, Response } from "express";
import mongoose from "mongoose";
import PurchaseOrder from "../models/PurchaseOrder";
import { verifyToken } from "../utils/auth";
import { generateInvoiceNumber } from "../utils/generateInvoice";
import { generateBatchNumber } from "../utils/generateBatch";
import QC from "../models/QualityControl";
import Stock from "../models/Stock";
import StockLot from "../models/StockLot";
import Supplier from "../models/Supplier";
import Warehouse from "../models/Warehouse";
import Product from "../models/Product";
import { updatePurchaseOrderStatus } from "../utils/purchaseOrderStatusHelper";

import StockTransaction from "../models/StockTransaction";

// ⬇️ เพิ่มเพื่อ resolve owner
import User from "../models/User";
import Employee from "../models/Employee";

/* ========================================================
   🔧 Helper: หา document จาก id หรือชื่อ
======================================================== */
async function ensureObjectIdOrByName(model: any, value: any, nameField: string) {
  if (!value) return null;
  if (mongoose.Types.ObjectId.isValid(value)) {
    return await model.findById(value).lean();
  }
  return await model.findOne({ [nameField]: value }).lean();
}

/* ========================================================
   🔑 Helper: resolve ownerId (string เสมอ)
======================================================== */
async function getOwnerId(userId: string): Promise<string> {
  let user: any = await User.findById(userId).lean();
  if (!user) user = await Employee.findById(userId).lean();
  if (!user) throw new Error("User not found");

  if (user.role === "admin") return user._id.toString();
  if (user.role === "employee") {
    if (!user.adminId) throw new Error("Employee does not have admin assigned");
    return user.adminId.toString();
  }
  throw new Error("Invalid user role");
}

/* ========================================================
   🧰 Scope ที่ “แมตช์ให้เจอให้ได้”
   - รองรับ userId แบบ ObjectId และ string
   - ครอบคลุมกรณีสร้างโดย employee (createdBy = actor)
======================================================== */
function buildPoScope(ownerId: string, actorId?: string) {
  const or: any[] = [
    { userId: new mongoose.Types.ObjectId(ownerId) },
    { userId: ownerId },
  ];
  if (actorId) {
    or.push({ createdBy: actorId });
    or.push({ userId: actorId });
    if (mongoose.Types.ObjectId.isValid(actorId)) {
      or.push({ createdBy: new mongoose.Types.ObjectId(actorId) });
      or.push({ userId: new mongoose.Types.ObjectId(actorId) });
    }
  }
  return { $or: or };
}

/* ==========================
   📦 ดึงรายการ Purchase Orders ทั้งหมด (ตาม owner)
========================== */
export const getPurchaseOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }

    const decoded = verifyToken(token);
    if (typeof decoded === "string" || !("userId" in decoded)) {
      res.status(401).json({ success: false, message: "Invalid token" }); return;
    }
    const actorId = (decoded as any).userId;
    const ownerId = await getOwnerId(actorId);

    const orders = await PurchaseOrder.find(buildPoScope(ownerId, actorId))
      .populate("supplierId")
      .populate("location")
      .populate("createdBy")
      .populate("updatedBy")
      .populate("items.productId", "name barcode")
      .populate("items.stockId")
      .populate("stockLots", "_id batchNumber status qcStatus expiryDate quantity remainingQty")
      .sort({ createdAt: -1 })
      .lean();

    // 🧩 รวม batchNumbers เพื่อดึง QC ครั้งเดียว
    const allBatchNumbers = orders.flatMap((po: any) => po.stockLots?.map((lot: any) => lot.batchNumber));
    const qcRecords = await QC.find(
      { batchNumber: { $in: allBatchNumbers } },
      "batchNumber failedQuantity totalQuantity status"
    ).lean();

    const qcMap = new Map<string, any>();
    qcRecords.forEach((qc) => {
      qcMap.set(qc.batchNumber, {
        failedQuantity: qc.failedQuantity || 0,
        qcStatus: qc.status,
        totalQuantity: qc.totalQuantity || 0,
      });
    });

    for (const po of orders) {
      if (po.stockLots?.length) {
        po.stockLots = po.stockLots.map((lot: any) => {
          const qc = qcMap.get(lot.batchNumber);
          return {
            ...lot,
            failedQuantity: qc?.failedQuantity ?? 0,
            qcStatus: qc?.qcStatus || lot.qcStatus,
            totalQuantity: qc?.totalQuantity ?? lot.quantity ?? 0,
          };
        });
      }
    }

    res.status(200).json({
      success: true,
      message: "ดึงรายการ PO สำเร็จ (พร้อมข้อมูลจำนวนไม่ผ่าน QC)",
      data: orders || [],
    });
  } catch (error) {
    console.error("❌ Get PO Error:", error);
    res.status(500).json({ success: false, message: "Server error while fetching POs", error: (error as Error).message });
  }
};

/* ==========================
   📄 ดึงรายละเอียด PO ตาม ID (ตาม owner)
========================== */
export const getPurchaseOrderById = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }

    const decoded = verifyToken(token);
    if (typeof decoded === "string" || !("userId" in decoded)) {
      res.status(401).json({ success: false, message: "Invalid token" }); return;
    }
    const actorId = (decoded as any).userId;
    const ownerId = await getOwnerId(actorId);

    const { id } = req.params;

    const po = await PurchaseOrder.findOne({ _id: id, ...buildPoScope(ownerId, actorId) })
      .populate("supplierId", "companyName phoneNumber email")
      .populate("location", "name code")
      .populate("createdBy", "username email role")
      .populate("updatedBy", "username email role")
      .populate("items.productId", "name barcode")
      .populate("items.stockId", "totalQuantity status")
      .populate({
        path: "stockLots",
        populate: [
          { path: "productId", select: "name barcode" },
          { path: "stockId", select: "totalQuantity status" },
          { path: "supplierId", select: "companyName" },
          { path: "location", select: "name" },
        ],
      });

    if (!po) { res.status(404).json({ success: false, message: "ไม่พบ PurchaseOrder" }); return; }

    res.status(200).json({ success: true, message: "ดึงข้อมูล PO สำเร็จ ✅", data: po });
  } catch (error) {
    console.error("❌ Get PO By ID Error:", error);
    res.status(500).json({ success: false, message: "Server error while fetching PO" });
  }
};

/* ==========================
   📋 ดึงรายการ PO (แบบสรุป) ตาม owner
========================== */
export const getAllPurchaseOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }

    const decoded = verifyToken(token);
    if (typeof decoded === "string" || !("userId" in decoded)) {
      res.status(401).json({ success: false, message: "Invalid token" }); return;
    }
    const actorId = (decoded as any).userId;
    const ownerId = await getOwnerId(actorId);

    const purchaseOrders = await PurchaseOrder.find(buildPoScope(ownerId, actorId))
      .populate("supplierId", "companyName")
      .populate("location", "name code")
      .populate("stockLots", "_id status qcStatus expiryDate")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      message: "ดึงรายการใบสั่งซื้อสำเร็จ ✅",
      data: purchaseOrders.map((po) => ({
        _id: po._id,
        purchaseOrderNumber: po.purchaseOrderNumber,
        supplierCompany: (po as any).supplierId?.companyName || "ไม่ระบุ",
        totalLots: (po as any).stockLots?.length || 0,
        qcStatus: (po as any).qcStatus || "รอตรวจสอบ",
        status: po.status,
        createdAt: po.createdAt,
      })),
    });
  } catch (error) {
    console.error("❌ Get All PO Error:", error);
    res.status(500).json({ success: false, message: "ไม่สามารถดึงข้อมูลใบสั่งซื้อได้", error });
  }
};

/* ========================================================
   🧾 CREATE PURCHASE ORDER (บันทึก userId = owner)
======================================================== */
export const createPurchaseOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) { res.status(401).json({ success: false, message: "Unauthorized, no token" }); return; }

    const decoded = verifyToken(token);
    if (typeof decoded === "string" || !("userId" in decoded)) {
      res.status(401).json({ success: false, message: "Invalid token" }); return;
    }
    const actorId = (decoded as any).userId;
    const ownerId = await getOwnerId(actorId);

    const { purchaseOrderNumber, supplierId, supplierCompany, location, items, invoiceNumber } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, message: "Items are required" }); return;
    }

    const supplierDoc = await ensureObjectIdOrByName(Supplier, supplierId, "companyName");
    if (!supplierDoc) { res.status(400).json({ success: false, message: "ไม่พบ Supplier" }); return; }

    const warehouseDoc =
      (await ensureObjectIdOrByName(Warehouse, location, "name")) ||
      (await Warehouse.findOne({ name: location }).lean());
    if (!warehouseDoc) {
      res.status(400).json({ success: false, message: "ไม่พบคลังสินค้า" }); return;
    }

    const itemsWithTotal = items.map((it: any) => ({
      ...it,
      total: Number(it.quantity || 0) * Number(it.costPrice || 0),
    }));
    const totalAmount = itemsWithTotal.reduce((sum: number, it: any) => sum + Number(it.total || 0), 0);

    const po = await PurchaseOrder.create({
      userId: ownerId, // ⬅️ ผูก owner
      purchaseOrderNumber,
      supplierId: (supplierDoc as any)._id,
      supplierCompany: supplierCompany ?? (supplierDoc as any).companyName,
      location: (warehouseDoc as any)._id,
      items: itemsWithTotal,
      totalAmount,
      invoiceNumber: invoiceNumber || generateInvoiceNumber(),
      createdBy: actorId, // ผู้กดสร้าง (admin/employee)
      status: "รอดำเนินการ",
      stockLots: [],
    });

    res.status(201).json({
      success: true,
      message: "สร้างใบสั่งซื้อสำเร็จ (ยังไม่สร้างล็อตสินค้า)",
      data: po,
    });
  } catch (error) {
    console.error("❌ Create PO Error:", error);
    res.status(500).json({ success: false, message: "Server error while creating PO" });
  }
};

/* ========================================================
   ✅ CONFIRM PO → สร้าง StockLot/Stock ผูกกับ owner
======================================================== */
export const confirmPurchaseOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }

    const decoded = verifyToken(token);
    if (typeof decoded === "string" || !("userId" in decoded)) {
      res.status(401).json({ success: false, message: "Invalid token" }); return;
    }
    const actorId = (decoded as any).userId;
    const ownerId = await getOwnerId(actorId);
    const ownerObjId = new mongoose.Types.ObjectId(ownerId);

    const po = await PurchaseOrder.findOne({ _id: id, ...buildPoScope(ownerId, actorId) });
    if (!po) { res.status(404).json({ success: false, message: "ไม่พบใบสั่งซื้อ" }); return; }
    if (po.status !== "รอดำเนินการ") {
      res.status(400).json({ success: false, message: "PO นี้ถูกยืนยันแล้ว" }); return;
    }

    const supplierDoc = await Supplier.findById(po.supplierId).lean<{ _id: mongoose.Types.ObjectId; companyName: string; code?: string } | null>();
    const warehouseDoc = await Warehouse.findById(po.location).lean<{ _id: mongoose.Types.ObjectId; name: string; code?: string } | null>();
    if (!supplierDoc || !warehouseDoc) {
      res.status(400).json({ success: false, message: "ไม่พบข้อมูล Supplier หรือ Warehouse" }); return;
    }

    const supplierCode = supplierDoc.code ?? "SP00";
    const warehouseCode = warehouseDoc.code ?? "WH00";
    const stockLotIds: mongoose.Types.ObjectId[] = [];

    for (const raw of (po.items as any[])) {
      const batchNumber =
        raw.batchNumber && String(raw.batchNumber).trim() !== ""
          ? String(raw.batchNumber).trim()
          : await generateBatchNumber(warehouseCode, supplierCode, raw.productId.toString());

      const productDoc = await Product.findById(raw.productId)
        .select("barcode name")
        .lean<{ _id: mongoose.Types.ObjectId; barcode: string; name: string } | null>();
      if (!productDoc) { console.warn(`⚠️ ไม่พบสินค้า ID: ${raw.productId}`); continue; }

      let stock = await Stock.findOne({
        userId: ownerObjId,
        productId: raw.productId,
        location: warehouseDoc._id,
      });

      if (!stock) {
        stock = await Stock.create({
          userId: ownerObjId,
          productId: raw.productId,
          supplierId: supplierDoc._id,
          supplierName: supplierDoc.companyName,
          location: warehouseDoc._id,
          barcode: productDoc.barcode,
          totalQuantity: 0,
          threshold: raw.threshold ?? 5,
          status: "สินค้าพร้อมขาย",
          isActive: true,
        });
      }

      const stockLot = await StockLot.create({
        stockId: stock._id,
        productId: raw.productId,
        supplierId: supplierDoc._id,
        supplierName: supplierDoc.companyName,
        userId: ownerObjId, // ⬅️ ผูก owner
        location: warehouseDoc._id,
        purchaseOrderNumber: po.purchaseOrderNumber,
        barcode: productDoc.barcode,
        batchNumber,
        expiryDate: raw.expiryDate,
        quantity: raw.quantity,
        costPrice: raw.costPrice,
        salePrice: raw.salePrice ?? raw.costPrice,
        status: "รอตรวจสอบ QC",
        isActive: false,
        isTemporary: true,
        purchaseOrderId: po._id,
      });

      raw.batchNumber = batchNumber;
      raw.stockLotId = stockLot._id;
      stockLotIds.push(stockLot._id);
    }

    po.status = "ได้รับสินค้าแล้ว";
    po.qcStatus = "รอตรวจสอบ";
    po.stockLots = stockLotIds;
    po.receivedAt = new Date();
    po.updatedBy = actorId;
    po.markModified("items");
    await po.save();

    res.status(200).json({
      success: true,
      message: "✅ ยืนยันใบสั่งซื้อสำเร็จ (สร้างล็อตและ batchNumber แล้ว)",
      data: po,
    });
  } catch (error) {
    console.error("❌ Confirm PO Error:", error);
    res.status(500).json({ success: false, message: "Server error while confirming PO" });
  }
};

/* ========================================================
   🔁 RETURN PURCHASE ORDER (FULL RETURN) – scope owner
======================================================== */
export const returnPurchaseOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }

    const decoded = verifyToken(token);
    if (typeof decoded === "string" || !("userId" in decoded)) {
      res.status(401).json({ success: false, message: "Invalid token" }); return;
    }
    const actorId = (decoded as any).userId;
    const ownerId = await getOwnerId(actorId);
    const ownerObjId = new mongoose.Types.ObjectId(ownerId);

    const po = await PurchaseOrder.findOne({ _id: id, ...buildPoScope(ownerId, actorId) });
    if (!po) { res.status(404).json({ success: false, message: "ไม่พบ PurchaseOrder" }); return; }

    if (![
      "ไม่ผ่าน QC - รอส่งคืนสินค้า",
      "QC ผ่านบางส่วน",
      "ไม่ผ่าน QC - คืนสินค้าบางส่วนแล้ว",
    ].includes(po.status)) {
      res.status(400).json({ success: false, message: `PO นี้ไม่สามารถคืนสินค้าได้ (${po.status})` });
      return;
    }

    const lots = await StockLot.find({
      userId: ownerObjId,
      batchNumber: { $in: (po.items as any).map((i: any) => i.batchNumber) },
    });

    let totalReturnedValue = 0;
    const returnHistory: any[] = [];
    const skippedItems: string[] = [];

    for (const item of (po.items as any[])) {
      const lot = lots.find((l) => l.batchNumber === item.batchNumber);
      if (item.isReturned || (item.returnedQuantity ?? 0) > 0) {
        skippedItems.push(item.productName); continue;
      }
      if (!lot || (lot.qcStatus !== "ไม่ผ่าน" && lot.qcStatus !== "ผ่านบางส่วน")) continue;

      const failedQty = lot.qcStatus === "ไม่ผ่าน"
        ? item.quantity
        : Math.min(lot.failedQuantity ?? 0, item.quantity);

      if (failedQty <= 0) continue;

      const returnValue = failedQty * (item.costPrice || 0);
      totalReturnedValue += returnValue;

      item.isReturned = true;
      item.returnedQuantity = failedQty;
      item.returnedValue = returnValue;

      lot.returnStatus = failedQty === item.quantity ? "คืนทั้งหมด" : "คืนบางส่วน";
      lot.status = failedQty === item.quantity ? "ปิดล็อต" : "สินค้าพร้อมขาย";
      lot.isActive = failedQty !== item.quantity;
      lot.isTemporary = failedQty === item.quantity;
      if (lot.qcStatus === "ผ่านบางส่วน") {
        lot.failedQuantity = Math.max((lot.failedQuantity ?? 0) - failedQty, 0);
      } else {
        lot.remainingQty = 0;
      }
      lot.closedBy = actorId;
      lot.closedAt = new Date();
      await lot.save();

      returnHistory.push({
        productId: item.productId,
        productName: item.productName,
        batchNumber: item.batchNumber,
        returnedQuantity: failedQty,
        returnedValue: returnValue,
        returnedAt: new Date(),
        processedBy: actorId,
      });
    }

    const totalAmount = (po.items as any[]).reduce((s: number, i: any) => s + (i.total || 0), 0);
    (po as any).totalReturnedValue = totalReturnedValue;
    (po as any).totalAmountAfterReturn = totalAmount - totalReturnedValue;

    (po as any).returnHistory ??= [];
    (po as any).returnHistory.push(...returnHistory);

    po.returnedAt = new Date();
    po.updatedBy = actorId;
    po.markModified("items");
    await po.save();

    await updatePurchaseOrderStatus(po._id);

    res.status(200).json({
      success: true,
      message: `✅ คืนสินค้าสำเร็จ (คืน ${returnHistory.length} รายการ มูลค่า ${totalReturnedValue.toLocaleString()}฿)` +
        (skippedItems.length ? `\n⚠️ ข้าม ${skippedItems.length} รายการที่เคยคืนแล้ว (${skippedItems.join(", ")})` : ""),
      data: {
        poId: po._id,
        status: po.status,
        totalReturnedValue,
        totalAmountAfterReturn: (po as any).totalAmountAfterReturn,
        returnHistory: (po as any).returnHistory,
        skippedItems,
      },
    });
  } catch (error) {
    console.error("❌ Return PO Error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดขณะคืนสินค้า", error: (error as Error).message });
  }
};

/* ========================================================
   🔁 RETURN ITEM (บางรายการ) – scope owner
======================================================== */
export const returnPurchaseItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { itemId, batchNumber } = req.body;

    if (!itemId && !batchNumber) {
      res.status(400).json({ success: false, message: "กรุณาระบุ batchNumber หรือ itemId" });
      return;
    }

    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }

    const decoded = verifyToken(token);
    if (typeof decoded === "string" || !("userId" in decoded)) {
      res.status(401).json({ success: false, message: "Invalid token" }); return;
    }
    const actorId = (decoded as any).userId;
    const ownerId = await getOwnerId(actorId);
    const ownerObjId = new mongoose.Types.ObjectId(ownerId);

    const po = await PurchaseOrder.findOne({ _id: id, ...buildPoScope(ownerId, actorId) });
    if (!po) { res.status(404).json({ success: false, message: "ไม่พบ PurchaseOrder" }); return; }

    const item = (po.items as any[]).find(
      (i) => i._id?.toString() === itemId || i.batchNumber === batchNumber
    );
    if (!item) { res.status(404).json({ success: false, message: "ไม่พบสินค้าที่ต้องการคืน" }); return; }

    const qcRecord = await QC.findOne({ batchNumber: item.batchNumber });
    if (!qcRecord) { res.status(400).json({ success: false, message: `ไม่พบข้อมูล QC สำหรับล็อต ${item.batchNumber}` }); return; }

    const lot = await StockLot.findOne({ batchNumber: item.batchNumber, userId: ownerObjId });
    if (!lot) { res.status(404).json({ success: false, message: "ไม่พบล็อตสินค้านี้" }); return; }

    const canReturn = qcRecord.status === "ไม่ผ่าน" || qcRecord.status === "ผ่านบางส่วน";
    if (!canReturn) {
      res.status(400).json({ success: false, message: `❌ ล็อต ${item.batchNumber} ไม่สามารถคืนได้ (สถานะ: ${qcRecord.status})` });
      return;
    }

    const failedQty =
      qcRecord.status === "ไม่ผ่าน"
        ? item.quantity
        : Math.min(qcRecord.failedQuantity ?? 0, item.quantity);
    if (failedQty <= 0) {
      res.status(400).json({ success: false, message: "ไม่มีจำนวนสินค้าที่ไม่ผ่าน QC ให้คืน" });
      return;
    }

    const returnValue = failedQty * item.costPrice;
    item.isReturned = true;
    item.returnedQuantity = failedQty;
    item.returnedValue = returnValue;

    (po as any).returnHistory ??= [];
    (po as any).returnHistory.push({
      productId: item.productId,
      productName: item.productName,
      batchNumber: item.batchNumber,
      returnedQuantity: failedQty,
      returnedValue: returnValue,
      returnedAt: new Date(),
      processedBy: actorId,
    });

    lot.returnStatus = failedQty === item.quantity ? "คืนทั้งหมด" : "คืนบางส่วน";
    lot.status = failedQty === item.quantity ? "ปิดล็อต" : "สินค้าพร้อมขาย";
    lot.isActive = failedQty !== item.quantity;
    lot.isTemporary = failedQty === item.quantity;
    if (qcRecord.status === "ผ่านบางส่วน") {
      lot.failedQuantity = Math.max((lot.failedQuantity ?? 0) - failedQty, 0);
    } else {
      lot.remainingQty = 0;
    }
    lot.closedBy = actorId;
    lot.closedAt = new Date();
    await lot.save();

    const totalReturnedValue = (po.items as any[])
      .filter((i: any) => i.isReturned)
      .reduce((sum: number, i: any) => sum + (i.returnedValue || 0), 0);

    const totalPOValue = (po.items as any[]).reduce((s: number, i: any) => s + (i.total || 0), 0);
    (po as any).totalReturnedValue = totalReturnedValue;
    (po as any).totalAmountAfterReturn = totalPOValue - totalReturnedValue;

    po.returnedAt = new Date();
    po.updatedBy = actorId;
    po.markModified("items");
    await po.save();

    await updatePurchaseOrderStatus(po._id);

    res.status(200).json({
      success: true,
      message: `✅ คืนสินค้า "${item.productName}" (${failedQty} ชิ้น, มูลค่า ${returnValue.toLocaleString()}฿) สำเร็จแล้ว`,
      data: {
        poId: po._id,
        items: (po.items as any[]).map((i: any) => ({
          productName: i.productName,
          barcode: i.barcode,
          quantity: i.quantity,
          isReturned: i.isReturned,
          returnedQuantity: i.returnedQuantity,
          returnedValue: i.returnedValue,
          costPrice: i.costPrice,
          batchNumber: i.batchNumber,
        })),
        totalReturnedValue,
        totalAmountAfterReturn: (po as any).totalAmountAfterReturn,
        updatedStatus: po.status,
        returnHistory: (po as any).returnHistory,
      },
    });
  } catch (error) {
    console.error("❌ Return Item Error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดขณะคืนสินค้า", error: (error as Error).message });
  }
};

/* ========================================================
   ❌ CANCEL PURCHASE ORDER – scope owner
======================================================== */
export const cancelPurchaseOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) { res.status(401).json({ success: false, message: "Unauthorized, no token" }); return; }

    const decoded = verifyToken(token);
    if (typeof decoded === "string" || !("userId" in decoded)) {
      res.status(401).json({ success: false, message: "Invalid token" }); return;
    }
    const actorId = (decoded as any).userId;
    const ownerId = await getOwnerId(actorId);

    const { id } = req.params;
    const po = await PurchaseOrder.findOne({ _id: id, ...buildPoScope(ownerId, actorId) });
    if (!po) { res.status(404).json({ success: false, message: "ไม่พบ PurchaseOrder" }); return; }

    if (po.status !== "รอดำเนินการ") {
      res.status(400).json({ success: false, message: "ไม่สามารถยกเลิก PO ที่ได้รับสินค้าแล้วหรืออยู่ในขั้นตอน QC ได้" });
      return;
    }

    po.status = "ยกเลิก";
    po.updatedBy = actorId;
    await po.save();

    // ลบ StockLot ที่สร้างจาก PO นี้ (ถ้ามี) เฉพาะของ owner
    const lotIds = (po.items as any[]).map((x) => x.stockLotId).filter(Boolean);
    if (lotIds.length > 0) {
      await StockLot.deleteMany({
        _id: { $in: lotIds },
        userId: new mongoose.Types.ObjectId(ownerId),
      });
    }

    res.status(200).json({ success: true, message: "ยกเลิก PO สำเร็จ ✅", data: po });
  } catch (error) {
    console.error("❌ Cancel PO Error:", error);
    res.status(500).json({ success: false, message: "Server error while cancelling PO" });
  }
};
