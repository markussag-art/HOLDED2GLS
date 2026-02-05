"use client";

const STATUS_STYLES: Record<string, string> = {
  Pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  Labeled: "bg-green-100 text-green-800 border-green-200",
  Error: "bg-red-100 text-red-800 border-red-200",
  Shipped: "bg-blue-100 text-blue-800 border-blue-200",
  Cancelled: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style}`}>
      {status}
    </span>
  );
}
