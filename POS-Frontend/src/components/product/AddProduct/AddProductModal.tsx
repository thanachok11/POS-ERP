import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { uploadProduct } from "../../../api/product/productApi";
import { getSupplierData } from "../../../api/suppliers/supplierApi";
import { getWarehouses } from "../../../api/product/warehousesApi";
import { getCategories } from "../../../api/product/categoryApi";

import ProductFormSection from "./ProductFormSection";
import StockFormSection from "./StockFormSection";
import SuccessPopup from "./SuccessPopup";
import ErrorPopup from "./ErrorPopup";
import WarehouseModal from "../Warehouses";
import CategoryModal from "../CategoryModal";

import "../../../styles/product/AddProductModal.css";

interface AddProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (newProduct: any) => void;
}

const AddProductModal: React.FC<AddProductModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [suppliers, setSuppliers] = useState<{ companyName: string; _id: string }[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [errormessage, setErrorMessage] = useState("");

    const [productData, setProductData] = useState({
        name: "",
        description: "",
        category: "",
        barcode: "",
    });

    const [stockData, setStockData] = useState({
        totalQuantity: 0,
        threshold: 5,
        costPrice: 0,
        salePrice: 0,
        lastPurchasePrice: 0,
        units: [] as { name: string; totalQuantity: number }[],
        barcode: "",
        batchNumber: "",
        expiryDate: "",
        notes: "",
        isActive: true,
        supplierId: "",
        supplierName: "",
        location: "",
    });

    const [image, setImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [showWarehouseModal, setShowWarehouseModal] = useState(false);
    const [showSuccessPopup, setShowSuccessPopup] = useState(false);
    const [showErrorPopup, setShowErrorPopup] = useState(false);

    const navigate = useNavigate();

    // ✅ โหลดข้อมูลเริ่มต้น (supplier/category/warehouse)
    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) return;

        (async () => {
            try {
                const supplierList = await getSupplierData(token);
                if (Array.isArray(supplierList)) setSuppliers(supplierList);
                if (supplierList.data) setSuppliers(supplierList.data);
            } catch (e) {
                console.error("❌ Supplier fetch error", e);
            }

            try {
                const categoryList = await getCategories(token);
                if (categoryList.success) setCategories(categoryList.data);
            } catch (e) {
                console.error("❌ Category fetch error", e);
            }

            try {
                const warehouseList = await getWarehouses();
                if (Array.isArray(warehouseList)) setWarehouses(warehouseList);
            } catch (e) {
                console.error("❌ Warehouse fetch error", e);
            }
        })();
    }, []);

    // ✅ handle input fields
    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
        ) => {
        const { name, value, type } = e.target;

        if (name === "supplierId") {
            const supplier = suppliers.find((s) => s._id === value);
            setStockData((prev) => ({
            ...prev,
            supplierId: value,
            supplierName: supplier?.companyName || "",
            }));
            return;
        }

        // ฟิลด์ตัวเลขของ stock
        const numericStockFields = new Set([
            "totalQuantity", "threshold", "costPrice", "salePrice", "lastPurchasePrice"
        ]);

        if (name in productData) {
            setProductData((prev) => ({ ...prev, [name]: value }));
        } else if (name in stockData) {
            setStockData((prev) => ({
            ...prev,
            [name]:
                type === "checkbox"
                ? (e.target as HTMLInputElement).checked
                : numericStockFields.has(name)
                ? Number(value || 0)
                : value,
            }));
        }
        };

    // ✅ handle image preview
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImage(file);
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    // ✅ handle submit form
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = localStorage.getItem("token");
        if (!token) return;

        if (
            !productData.name ||
            !productData.description ||
            !productData.category ||
            !image ||
            !stockData.totalQuantity ||
            !stockData.supplierId ||
            !stockData.location
        ) {
            setErrorMessage("กรุณากรอกข้อมูลให้ครบถ้วน");
            setShowErrorPopup(true);
            return;
        }

        setLoading(true);
        const formData = new FormData();

        Object.entries(productData).forEach(([key, value]) => {
            formData.append(key, String(value ?? ""));
        });

        formData.append("image", image);

        Object.entries(stockData).forEach(([key, value]) => {
            if (Array.isArray(value)) formData.append(key, JSON.stringify(value));
            else formData.append(key, String(value ?? ""));
        });

        formData.set("totalQuantity", String(stockData.totalQuantity || 0));
        formData.set("quantity", String(stockData.totalQuantity || 0));

        console.log("Debug submit stockData:", stockData);

        try {
            const response = await uploadProduct(formData, token);
            if (response?.data) onSuccess(response.data);
            setShowSuccessPopup(true);
        } catch (err: any) {
            console.error("❌ Upload error:", err);
            setErrorMessage(err?.response?.data?.message || "เพิ่มสินค้าไม่สำเร็จ");
            setShowErrorPopup(true);
        } finally {
            setLoading(false);
        }
    };

    // ✅ unit controls
    const addUnit = () =>
        setStockData((prev) => ({
            ...prev,
            units: [...(prev.units || []), { name: "", totalQuantity: 1 }],
        }));

    const removeUnit = (index: number) =>
        setStockData((prev) => ({
            ...prev,
            units: prev.units.filter((_, i) => i !== index),
        }));

    const handleUnitChange = (index: number, field: "name" | "totalQuantity", value: any) => {
        const newUnits = [...stockData.units];
        newUnits[index] = { ...newUnits[index], [field]: value };
        setStockData({ ...stockData, units: newUnits });
    };

    if (!isOpen) return null;

    return (
        <div className="add-product-modal-overlay">
            <div className="add-product-modal-content">
                <button className="add-product-modal-close" onClick={onClose}>
                    ✖
                </button>
                <h2 className="add-product-form-title">เพิ่มสินค้าใหม่</h2>

                <form className="add-product-form" onSubmit={handleSubmit}>
                    <ProductFormSection
                        productData={productData}
                        categories={categories}
                        imagePreview={imagePreview}
                        onImageChange={handleImageChange}
                        onInputChange={handleInputChange}
                        setShowCategoryModal={setShowCategoryModal}
                    />

                    <StockFormSection
                        stockData={stockData}
                        suppliers={suppliers}
                        warehouses={warehouses}
                        handleInputChange={handleInputChange}
                        handleUnitChange={handleUnitChange}
                        addUnit={addUnit}
                        removeUnit={removeUnit}
                        setShowWarehouseModal={setShowWarehouseModal}
                    />

                    <div className="add-product-form-actions">
                        <button type="submit" disabled={loading} className="add-product-submit-btn">
                            {loading ? "กำลังเพิ่มสินค้า..." : "เพิ่มสินค้า"}
                        </button>
                    </div>
                </form>

                {showSuccessPopup && (
                    <SuccessPopup
                        onClose={() => {
                            setShowSuccessPopup(false);
                            onClose();
                            navigate("/stocks");
                        }}
                    />
                )}

                {showErrorPopup && (
                    <ErrorPopup
                        message={errormessage}
                        onClose={() => {
                            setShowErrorPopup(false);
                            setErrorMessage("");
                        }}
                    />
                )}

                {/* Sub Modals */}
                <CategoryModal
                    isOpen={showCategoryModal}
                    onClose={() => setShowCategoryModal(false)}
                    onSuccess={(newCat) => {
                        setCategories((prev) => [...prev, newCat]);
                        setProductData({ ...productData, category: newCat._id });
                    }}
                />
                <WarehouseModal
                    isOpen={showWarehouseModal}
                    onClose={() => setShowWarehouseModal(false)}
                    onSuccess={(newWh) => {
                        setWarehouses((prev) => [...prev, newWh]);
                        setStockData({ ...stockData, location: newWh.name });
                    }}
                />
            </div>
        </div>
    );
};

export default AddProductModal;
