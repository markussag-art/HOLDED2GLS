import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "all";
  const search = url.searchParams.get("search") || "";
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = parseInt(url.searchParams.get("limit") || "25", 10);
  const sortBy = url.searchParams.get("sortBy") || "createdAt";
  const sortDir = url.searchParams.get("sortDir") || "desc";

  const where: Record<string, unknown> = {};

  if (status && status !== "all") {
    where.localStatus = status;
  }

  if (search) {
    where.OR = [
      { holdedDocNumber: { contains: search } },
      { recipientName: { contains: search } },
      { recipientCompany: { contains: search } },
      { city: { contains: search } },
      { trackingNumber: { contains: search } },
    ];
  }

  const [shipments, total] = await Promise.all([
    prisma.shipment.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.shipment.count({ where }),
  ]);

  return NextResponse.json({
    shipments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
