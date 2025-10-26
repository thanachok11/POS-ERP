export const resolveApprovedPurchaseTotal = (po: any): number => {
    if (!po) {
        return 0;
    }

    const approvedBatches = new Set(
        (po.stockLots || [])
            .filter((lot: any) => ((lot?.qcStatus || "") as string).trim() === "ผ่าน")
            .map((lot: any) => lot?.batchNumber)
            .filter((batch: any) => typeof batch === "string" || typeof batch === "number")
    );

    if (approvedBatches.size === 0) {
        return 0;
    }

    return (po.items || []).reduce((sum: number, item: any) => {
        const batch = item?.batchNumber || "";
        if (!approvedBatches.has(batch)) {
            return sum;
        }

        const directTotal = item?.total;
        let value: number;

        if (typeof directTotal === "number" && Number.isFinite(directTotal)) {
            value = directTotal;
        } else {
            const cost = Number(item?.costPrice ?? 0);
            const quantity = Number(item?.quantity ?? 0);
            value = cost * quantity;
        }

        const numericValue = Number(value);
        return sum + (Number.isFinite(numericValue) ? numericValue : 0);
    }, 0);
};