import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import Product from "../models/Product";
import Stock from "../models/Stock";
import User from "../models/User";
import Employee from "../models/Employee";
import Category from "../models/Category";

// -------------------------
// 🔑 Helper Functions
// -------------------------
const verifyToken = (token: string) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET as string);
  } catch {
    throw new Error("Invalid token");
  }
};

const getDecodedUserId = (req: Request): string | null => {
  const token = req.header("Authorization")?.split(" ")[1];
  if (!token) return null;

  const decoded = verifyToken(token);
  if (typeof decoded !== "string" && "userId" in decoded) {
    return decoded.userId;
  }
  return null;
};

const getOwnerId = async (userId: string): Promise<string> => {
  let user = (await User.findById(userId)) || (await Employee.findById(userId));
  if (!user) throw new Error("User not found");

  if (user.role === "admin" || user.role === "manager") return user._id.toString();
  if (user.role === "employee") {
    if (!user.adminId) throw new Error("Employee does not have an admin assigned");
    return user.adminId.toString();
  }
  throw new Error("Invalid user role");
};

// -------------------------
// 📦 Product (ข้อมูลสินค้าอย่างเดียว)
// -------------------------
export const getProductByBarcode = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const product = await Product.findOne({ barcode: req.params.barcode });
    if (!product) {
      res.status(404).json({ success: false, message: "Product not found" });
      return;
    }
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error });
  }
};

export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const allowedFields = [
      "name",
      "description",
      "category",
      "imageUrl",
      "public_id",
      "defaultCostPrice",
      "defaultSalePrice",
      "isSelfPurchased",
      "isActive", // ✅ เพิ่มตรงนี้
    ];

    const updates = Object.keys(req.body)
      .filter((key) => allowedFields.includes(key))
      .reduce((obj: any, key) => {
        obj[key] = req.body[key];
        return obj;
      }, {});

    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updates, {
      new: true,
    });

    if (!updatedProduct) {
      res.status(404).json({ success: false, message: "Product not found" });
      return;
    }

    res.status(200).json({
      success: true,
      message: "✅ Product updated successfully (including isActive status)",
      data: updatedProduct,
    });
  } catch (error: any) {
    console.error("Update Product Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};



export const deleteProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const deletedProduct = await Product.findByIdAndDelete(req.params.id);
    if (!deletedProduct) {
      res.status(404).json({ success: false, message: "Product not found" });
      return;
    }
    res
      .status(200)
      .json({ success: true, message: "Product deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------
// 📦 Inventory (สินค้า + stock)
// -------------------------
export const getProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) { res.status(401).json({ success:false, message:"Unauthorized" }); return; }

    const decoded = verifyToken(token);
    if (typeof decoded === "string" || !("userId" in decoded)) {
      res.status(401).json({ success:false, message:"Invalid token" }); return;
    }

    const ownerId = await getOwnerId(decoded.userId);

    const onlyAvailable =
      String(req.query.onlyAvailable || "").toLowerCase() === "true" ||
      String(req.query.onlyAvailable || "").toLowerCase() === "1";

    // เงื่อนไขฝั่ง Stock
    const find: any = { userId: ownerId };
    if (onlyAvailable) {
      find.isActive = { $ne: false };        // ค่า undefined = ผ่าน
      find.totalQuantity = { $gt: 0 };
      find.status = { $ne: "สินค้าหมด" };
    }

    const stocks = await Stock.find(find)
      .populate({
        path: "productId",
        model: "Product",
        // ❌ อย่าใช้ match:{isActive:true} ตัดของทิ้ง
        // ใช้ select เฉย ๆ พอ แล้วไปกรองด้วยโค้ดด้านล่าง
        select: "name description barcode imageUrl category salePrice costPrice isActive",
        populate: { path: "category", model: "Category", select: "name" },
      })
      .populate("location", "name code")
      .populate("supplierId", "companyName contactName")
      .lean();

    // ถ้าอยากซ่อนสินค้าที่ปิดใช้งานจริง ๆ ให้กรองหลัง populate แบบยืดหยุ่น
    const data = onlyAvailable
      ? (stocks || []).filter(s =>
          (s.totalQuantity ?? 0) > 0 &&
          s.isActive !== false &&                         // stock ปิดไว้ไหม
          (s.productId ? s.productId.isActive !== false : true) // product ปิดไว้ไหม (undefined = ผ่าน)
        )
      : (stocks || []);

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("❌ Get Products Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


export const getAllProducts = async (_: Request, res: Response): Promise<void> => {
  try {
    const stocks = await Stock.find()
      .populate("productId")
      .populate("location")
      .populate("supplierId");

    res.status(200).json({ success: true, data: stocks });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};


export const getProductsByCategory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = getDecodedUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const ownerId = await getOwnerId(userId);

    const stocks = await Stock.find({ userId: ownerId })
      .populate({
        path: "productId",
        match: { category: req.params.category },
      })
      .populate("location")
      .populate("supplierId");

    const filtered = stocks.filter((s) => s.productId !== null);

    if (!filtered.length) {
      res.status(404).json({
        success: false,
        message: "No products found for this category",
      });
      return;
    }

    res.status(200).json({ success: true, data: filtered });
  } catch (error: any) {
    res.status(403).json({ success: false, message: error.message });
  }
};

export const getBatchesByProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params; // productId
    const stocks = await Stock.find({ productId: id })
      .populate("supplierId")
      .populate("location")
      .sort({ createdAt: -1 });

    if (!stocks.length) {
      res.status(404).json({ success: false, message: "No batches found for this product" });
      return;
    }

    res.status(200).json({
      success: true,
      message: "ดึงล็อตสินค้าสำเร็จ",
      data: stocks,
    });
  } catch (error) {
    console.error("Get Batches Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// -------------------------
// 🏷️ Category Controllers
// -------------------------
export const getCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getDecodedUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const ownerId = await getOwnerId(userId);
    const categories = await Product.distinct("category", { userId: ownerId });

    res.status(200).json({ success: true, data: categories });
  } catch (error: any) {
    res.status(403).json({ success: false, message: error.message });
  }
};

export const fetchCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getDecodedUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    let user = (await User.findById(userId)) || (await Employee.findById(userId));
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const ownerId = user.role === "employee" ? user.adminId : user._id;
    const categories = await Category.find({ adminId: ownerId });

    res.status(200).json({ success: true, data: categories });
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch categories" });
  }
};

export const addCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getDecodedUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    let user = (await User.findById(userId)) || (await Employee.findById(userId));
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const { name, description } = req.body;
    if (!name?.trim()) {
      res
        .status(400)
        .json({ success: false, message: "Category name is required" });
      return;
    }

    const existing = await Category.findOne({ name });
    if (existing) {
      res
        .status(400)
        .json({ success: false, message: "Category already exists" });
      return;
    }

    const newCategory = new Category({ name, description, adminId: userId });
    await newCategory.save();

    res.status(201).json({
      success: true,
      message: "Category added successfully",
      data: newCategory,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error while adding category",
    });
  }
};

export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedCategory) {
      res.status(404).json({ success: false, message: "Category not found" });
      return;
    }
    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: updatedCategory,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const deletedCategory = await Category.findByIdAndDelete(req.params.id);
    if (!deletedCategory) {
      res.status(404).json({ success: false, message: "Category not found" });
      return;
    }
    res
      .status(200)
      .json({ success: true, message: "Category deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
