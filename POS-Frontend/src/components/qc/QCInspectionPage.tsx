// ✅ QCInspectionPage.tsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getPurchaseOrderById } from "../../api/purchaseOrder/purchaseOrderApi";
import { createQCRecord, getQCByBatch, updateQCStatus } from "../../api/purchaseOrder/qcApi";
import "../../styles/qc/QCInspectionPage.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCheck } from "@fortawesome/free-solid-svg-icons";
import GlobalPopup from "../layout/GlobalPopup";
import QCTable from "./QCTable";

const QCInspectionPage: React.FC = () => {
    const { poId } = useParams<{ poId: string }>();
    const navigate = useNavigate();

    const [po, setPo] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [qcData, setQcData] = useState<Record<string, any>>({});
    const [files, setFiles] = useState<Record<string, File[]>>({});
    const [saving, setSaving] = useState(false);
    const [showPopup, setShowPopup] = useState(false);
    const [popupMessage, setPopupMessage] = useState("");
    const [popupSuccess, setPopupSuccess] = useState(true);
    const [popupLocked, setPopupLocked] = useState(false);
    const [rowLoading, setRowLoading] = useState<string | null>(null);

    // ✅ โหลดข้อมูล PO และ QC เดิม
    useEffect(() => {
        const loadData = async () => {
            try {
                const token = localStorage.getItem("token") || "";
                const res = await getPurchaseOrderById(poId!, token);
                const poData = res.data;
                setPo(poData);

                const qcPromises = poData.items.map((item: any) =>
                    getQCByBatch(item.batchNumber, token).catch(() => null)
                );
                const qcResults = await Promise.all(qcPromises);

                const qcMap: Record<string, any> = {};
                qcResults.forEach((qcRes, i) => {
                    const batch = poData.items[i].batchNumber;
                    if (qcRes && qcRes.success && qcRes.data.length > 0) {
                        qcMap[batch] = qcRes.data[0];
                    }
                });
                setQcData(qcMap);
            } catch {
                setPopupMessage("❌ โหลดข้อมูล QC ไม่สำเร็จ");
                setPopupSuccess(false);
                setShowPopup(true);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [poId]);

    // ✅ บันทึก QC แถวเดียว (อิงข้อมูลจริงจาก backend)
    const handleSubmitQC = async (item: any) => {
        const batchNumber = item.batchNumber;
        const qc = qcData[batchNumber] || {};
        const token = localStorage.getItem("token") || "";

        // ถ้ายังไม่เลือกระดับสถานะเลย
        if (!qc.status) {
            setPopupMessage(`⚠️ กรุณาเลือกสถานะของ ${item.productName}`);
            setPopupSuccess(false);
            setShowPopup(true);
            return;
        }

        const total = Number(item.quantity || 0);
        const failed = Number(qc.failedQuantity || 0);

        // 🔧 คำนวณสถานะ "จริง" ที่จะส่งเข้า backend ก่อน
        let status: "ผ่าน" | "ผ่านบางส่วน" | "ไม่ผ่าน" | "รอตรวจสอบ" = qc.status;
        if (failed <= 0) status = "ผ่าน";
        else if (failed >= total) status = "ไม่ผ่าน";
        else status = "ผ่านบางส่วน";

        // ✅ หลังได้ status จริงแล้วค่อยบังคับวันหมดอายุ
        const expiry = qc.expiryDate || item.expiryDate || "";
        if (status === "ผ่าน" && !expiry) {
            setPopupMessage(`⚠️ กรุณากรอกวันหมดอายุของ ${item.productName}`);
            setPopupSuccess(false);
            setShowPopup(true);
            return;
        }

        const passed = Math.max(0, total - failed);
        setRowLoading(batchNumber);

        try {
            const formData = new FormData();
            formData.append("batchNumber", batchNumber);
            formData.append("productId", item.productId?._id || item.productId || "");
            formData.append("supplierId", po.supplierId?._id || po.supplierId || "");
            formData.append("warehouseId", po.location?._id || po.location || "");
            formData.append("totalQuantity", String(total));
            formData.append("failedQuantity", String(failed));
            formData.append("passedQuantity", String(passed));
            formData.append("status", status);
            formData.append("remarks", qc.remarks || "");
            if (expiry) formData.append("expiryDate", expiry);  // ส่งเฉพาะเมื่อมี

            (files[batchNumber] || []).forEach((file) => {
            if (file instanceof File) formData.append("attachments", file);
            });

            const res = await createQCRecord(formData, token);

            if (res.success) {
                const qcRecord = res.data?.qcRecord;
                const updatedLot = res.data?.updatedLot;

                // ✅ อัปเดต qcData ให้แน่นอน (เก็บ expiry/status ที่เพิ่งส่งขึ้นด้วย)
                setQcData(prev => ({
                    ...prev,
                    [batchNumber]: {
                    ...(prev[batchNumber] || {}),
                    ...qcRecord,                       // ของจริงจาก backend
                    status: qcRecord?.status || status,
                    expiryDate: qc.expiryDate || qcRecord?.expiryDate || updatedLot?.expiryDate || null,
                    failedQuantity: qc.failedQuantity ?? qcRecord?.failedQuantity ?? 0,
                    },
                }));

                // ✅ เผื่อ UI อื่นอิง PO อยู่ อัปเดต PO ในแถวด้วย
                if (updatedLot) {
                    setPo((prev: any) => ({
                    ...prev,
                    items: prev.items.map((it: any) =>
                        it.batchNumber === batchNumber
                        ? { ...it, qcStatus: updatedLot.qcStatus, expiryDate: updatedLot.expiryDate }
                        : it
                    ),
                    }));
                }

                // ✅ แสดงข้อความจาก backend
                setPopupMessage(res.message || `✅ บันทึกผล QC สำเร็จ (${item.productName})`);
                setPopupSuccess(true);
                setShowPopup(true);

                // ✅ อัปเดต qcData ด้วยข้อมูลจาก backend จริง
                if (qcRecord) {
                    setQcData((prev) => ({
                        ...prev,
                        [batchNumber]: qcRecord,
                    }));
                }

                // ✅ อัปเดต PO (เช่น status, expiryDate) โดยไม่ต้อง reload
                if (updatedLot) {
                    setPo((prev: any) => {
                        const newItems = prev.items.map((it: any) =>
                            it.batchNumber === batchNumber
                                ? {
                                    ...it,
                                    qcStatus: updatedLot.qcStatus,
                                    expiryDate: updatedLot.expiryDate,
                                }
                                : it
                        );
                        return { ...prev, items: newItems };
                    });
                }
            } else {
                setPopupMessage(res.message || "❌ ไม่สามารถบันทึก QC ได้");
                setPopupSuccess(false);
                setShowPopup(true);
            }
        } catch (error: any) {
            console.error("❌ handleSubmitQC Error:", error);
            const backendMessage =
                error?.response?.data?.message || "⚠️ เกิดข้อผิดพลาดในการบันทึก";
            setPopupMessage(backendMessage);
            setPopupSuccess(false);
            setShowPopup(true);
        } finally {
            setRowLoading(null);
        }
    };

    // ✅ สรุป QC ทั้งใบ (เหมือนเดิม)
    const handleSubmitFinalQC = async () => {
        const token = localStorage.getItem("token") || "";
        setSaving(true);
        try {
            if (!po?.items?.length) return;

            const missingExpiry: string[] = [];
            po.items.forEach((item: any) => {
            const q = qcData[item.batchNumber] || {};
            const status = q.status ?? item.qcStatus ?? "รอตรวจสอบ";
            const expiry = q.expiryDate ?? item.expiryDate ?? null;

            // ✅ บังคับ expiry เฉพาะ “ผ่าน”
            if (status === "ผ่าน" && !expiry) {
                missingExpiry.push(item.productName);
            }
            });

            if (missingExpiry.length > 0) {
            setPopupMessage(`⚠️ สินค้าต่อไปนี้ยังไม่ได้กรอกวันหมดอายุ:\n${missingExpiry.join("\n")}`);
            setPopupSuccess(false);
            setShowPopup(true);
            setSaving(false);
            return;
            }

            const res = await updateQCStatus(poId!, { qcStatus: "ผ่าน" }, token);

            if (res.success) {
                setPopupMessage(res.message || "✅ สรุป QC สำเร็จ!");
                setPopupSuccess(true);
                setShowPopup(true);
                setPopupLocked(true);

                const updatedPO = await getPurchaseOrderById(poId!, token);
                setPo(updatedPO.data);

                setTimeout(() => {
                    setPopupLocked(false);
                    navigate("/purchase-orders");
                }, 1500);
            } else {
                setPopupMessage(res.message || "❌ ไม่สามารถสรุป QC ได้");
                setPopupSuccess(false);
                setShowPopup(true);
            }
        } catch (error: any) {
            console.error("❌ handleSubmitFinalQC Error:", error);
            const backendMessage =
                error?.response?.data?.message || "⚠️ เกิดข้อผิดพลาดในการสรุป QC";
            setPopupMessage(backendMessage);
            setPopupSuccess(false);
            setShowPopup(true);
        }
    };

    if (loading) return <p className="qc-loading">⏳ กำลังโหลดข้อมูล...</p>;
    if (!po) return <p className="qc-error">ไม่พบข้อมูลใบสั่งซื้อ</p>;
    const isFinalized =
        po.qcStatus === "ผ่าน" || po.qcStatus === "ไม่ผ่าน" || po.qcStatus === "สรุปแล้ว";

    return (
        <div className="display">
            <div className="qc-container">
                <div className="qc-header-wrapper">
                    <h1 className="qc-header">🧪 ตรวจสอบคุณภาพสินค้า (QC)</h1>
                    <p className="qc-subtitle">
                        ใบสั่งซื้อ: <strong>{po.purchaseOrderNumber}</strong> / ผู้จัดส่ง:{" "}
                        {po.supplierCompany}
                    </p>
                    <button className="qc-back-btn" onClick={() => navigate("/purchase-orders")}>
                        <FontAwesomeIcon icon={faArrowLeft} /> กลับ
                    </button>
                </div>

                {/* ✅ ตาราง QC */}
                <QCTable
                    po={po}
                    qcData={qcData}
                    setQcData={setQcData}
                    files={files}
                    setFiles={setFiles}
                    saving={saving}
                    isFinalized={isFinalized}
                    handleSubmitQC={handleSubmitQC}
                    rowLoading={rowLoading}
                />

                {/* ✅ ปุ่มสรุป QC */}
                <div className="qc-finalize-section">
                    <button
                        className={`qc-submit-btn ${saving || isFinalized || popupLocked ? "disabled" : "active"
                            }`}
                        disabled={saving || isFinalized || popupLocked}
                        onClick={handleSubmitFinalQC}
                    >
                        {saving ? (
                            <>
                                <span className="qc-spinner" /> กำลังสรุปผล...
                            </>
                        ) : (
                            <>
                                <FontAwesomeIcon icon={faCheck} /> สรุปผลการตรวจสอบสินค้า
                            </>
                        )}
                    </button>
                </div>

                <GlobalPopup
                    message={popupMessage}
                    isSuccess={popupSuccess}
                    show={showPopup}
                    setShow={(val) => {
                        setShowPopup(val);
                        if (!val) setPopupLocked(false);
                    }}
                />
            </div>
        </div>
    );
};

export default QCInspectionPage;
