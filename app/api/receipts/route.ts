import { NextResponse } from "next/server";

import { saveReceipt } from "@/lib/utils/receipt-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, txHash, view } = body ?? {};

    if (typeof id !== "string" || typeof txHash !== "string" || typeof view !== "object") {
      return NextResponse.json({ error: "malformed receipt" }, { status: 400 });
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return NextResponse.json({ error: "malformed tx hash" }, { status: 400 });
    }

    await saveReceipt({ id, txHash, view, storedAt: Date.now() });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to store receipt" },
      { status: 400 },
    );
  }
}
