"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ManualJobPayload } from "@/lib/validation";
import { FULFILLMENT_OPTIONS, type FulfillmentQueryValue } from "@/lib/format";
import { handleUnauthorizedResponse } from "@/lib/client-auth";
import { useNotifications } from "@/components/notifications-provider";

interface LineItemInput {
  description: string;
  quantity: string;
  unitPrice: string;
  material: string;
  color: string;
  notes: string;
}

function createEmptyLineItem(): LineItemInput {
  return {
    description: "",
    quantity: "1",
    unitPrice: "",
    material: "",
    color: "",
    notes: "",
  };
}

function formatDateTimeLocal(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

function parseMoney(value: string, label: string) {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${label} is required.`);
  }
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) {
    throw new Error(`${label} must be a valid number.`);
  }
  return Math.round(amount * 100);
}

function parseOptionalJson(value: string, label: string) {
  if (!value || value.trim().length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

function normalizeLineItems(inputs: LineItemInput[]) {
  const normalized = inputs
    .map((item, index) => {
      const description = item.description.trim();
      const hasContent = description.length > 0 || item.unitPrice.trim().length > 0 || item.material.trim().length > 0;
      if (!hasContent) {
        return null;
      }
      if (description.length === 0) {
        throw new Error(`Line item ${index + 1} is missing a description.`);
      }
      const quantity = Number.parseInt(item.quantity, 10);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`Line item ${index + 1} has an invalid quantity.`);
      }
      if (item.unitPrice.trim().length === 0) {
        throw new Error(`Line item ${index + 1} is missing a unit price.`);
      }
      const unitPriceCents = parseMoney(item.unitPrice, `Line item ${index + 1} price`);
      const normalizedItem: NonNullable<ManualJobPayload["lineItems"]>[number] = {
        description,
        quantity,
        unitPriceCents,
      };
      if (item.material.trim().length > 0) {
        normalizedItem.material = item.material.trim();
      }
      if (item.color.trim().length > 0) {
        normalizedItem.color = item.color.trim();
      }
      if (item.notes.trim().length > 0) {
        normalizedItem.notes = item.notes.trim();
      }
      return normalizedItem;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (normalized.length === 0) {
    throw new Error("Add at least one line item with a description and price.");
  }
  return normalized;
}

interface ManualJobFormProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ManualJobForm({ isOpen, onClose }: ManualJobFormProps) {
  const router = useRouter();
  const { notify } = useNotifications();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [customerEmail, setCustomerEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [makerworksCreatedAt, setMakerworksCreatedAt] = useState(formatDateTimeLocal(new Date()));
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [fulfillmentStatus, setFulfillmentStatus] = useState<FulfillmentQueryValue>("pending");
  const [metadataJson, setMetadataJson] = useState("");
  const [shippingJson, setShippingJson] = useState("");
  const [lineItems, setLineItems] = useState<LineItemInput[]>([createEmptyLineItem()]);

  const canSubmit = useMemo(() => {
    return !isSubmitting && jobId.trim().length > 0 && paymentIntentId.trim().length > 0 && totalAmount.trim().length > 0;
  }, [isSubmitting, jobId, paymentIntentId, totalAmount]);

  function resetForm() {
    setJobId("");
    setPaymentIntentId("");
    setTotalAmount("");
    setCurrency("usd");
    setCustomerEmail("");
    setUserId("");
    setMakerworksCreatedAt(formatDateTimeLocal(new Date()));
    setNotes("");
    setPaymentMethod("");
    setPaymentStatus("");
    setFulfillmentStatus("pending");
    setMetadataJson("");
    setShippingJson("");
    setLineItems([createEmptyLineItem()]);
  }

  function handleAddLineItem() {
    setLineItems((items) => [...items, createEmptyLineItem()]);
  }

  function handleRemoveLineItem(index: number) {
    setLineItems((items) => {
      if (items.length === 1) {
        return items;
      }
      return items.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      const normalizedJobId = jobId.trim();
      const normalizedPaymentIntent = paymentIntentId.trim();
      if (normalizedJobId.length === 0) {
        throw new Error("Job ID is required.");
      }
      if (normalizedPaymentIntent.length === 0) {
        throw new Error("Payment intent ID is required.");
      }

      const totalCents = parseMoney(totalAmount, "Job total");
      const parsedLineItems = normalizeLineItems(lineItems);
      const metadata = parseOptionalJson(metadataJson, "Metadata");
      const shipping = parseOptionalJson(shippingJson, "Shipping");
      const createdAtValue = makerworksCreatedAt.trim();
      const createdAt = createdAtValue.length > 0 ? new Date(createdAtValue) : new Date();
      if (Number.isNaN(createdAt.getTime())) {
        throw new Error("MakerWorks created date is invalid.");
      }
      const normalizedPaymentMethod = paymentMethod.trim();
      const normalizedPaymentStatus = paymentStatus.trim();

      const payload: ManualJobPayload = {
        id: normalizedJobId,
        paymentIntentId: normalizedPaymentIntent,
        totalCents,
        currency: currency.trim() || "usd",
        makerworksCreatedAt: createdAt,
        lineItems: parsedLineItems,
        customerEmail: customerEmail.trim() ? customerEmail.trim() : null,
        userId: userId.trim() ? userId.trim() : null,
        notes: notes.trim(),
        metadata,
        shipping,
        fulfillmentStatus,
      };
      if (normalizedPaymentMethod.length > 0) {
        payload.paymentMethod = normalizedPaymentMethod;
      }
      if (normalizedPaymentStatus.length > 0) {
        payload.paymentStatus = normalizedPaymentStatus;
      }

      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (handleUnauthorizedResponse(response.status)) {
        return;
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "Unable to create job.");
      }

      notify({ type: "success", message: `Job ${body.job?.id ?? normalizedJobId} created.` });
      resetForm();
      router.refresh();
      onClose();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unexpected error";
      setError(message);
      notify({ type: "error", message });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/10 bg-[#090909] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.75)]">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white">Manually enter a job</h2>
            <p className="text-sm text-zinc-400">
              Record out-of-band fabrication work by hand. Provide at least one line item and a payment intent id.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="self-start rounded-md border border-white/10 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
          >
            Close
          </button>
        </div>
        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="manual-job-id" className="mb-1 block text-sm font-medium text-zinc-200">
                MakerWorks job id
              </label>
              <input
                id="manual-job-id"
                value={jobId}
                onChange={(event) => setJobId(event.target.value)}
                placeholder="manual-job-001"
                className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
              />
            </div>
            <div>
              <label htmlFor="manual-payment-intent" className="mb-1 block text-sm font-medium text-zinc-200">
                Payment intent id
              </label>
              <input
                id="manual-payment-intent"
                value={paymentIntentId}
                onChange={(event) => setPaymentIntentId(event.target.value)}
                placeholder="pi_manual_123"
                className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
              />
            </div>
            <div>
              <label htmlFor="manual-payment-method" className="mb-1 block text-sm font-medium text-zinc-200">
                Payment method
              </label>
              <input
                id="manual-payment-method"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                placeholder="Card"
                className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
              />
            </div>
            <div>
              <label htmlFor="manual-payment-status" className="mb-1 block text-sm font-medium text-zinc-200">
                Payment status
              </label>
              <input
                id="manual-payment-status"
                value={paymentStatus}
                onChange={(event) => setPaymentStatus(event.target.value)}
                placeholder="Paid"
                className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
              />
            </div>
            <div>
              <label htmlFor="manual-total-amount" className="mb-1 block text-sm font-medium text-zinc-200">
                Total amount
              </label>
              <div className="flex">
                <input
                  id="manual-total-amount"
                  value={totalAmount}
                  onChange={(event) => setTotalAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="185.00"
                  className="w-full rounded-l-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
                />
                <input
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                  className="w-24 rounded-r-md border border-l-0 border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
                />
              </div>
              <p className="mt-1 text-xs text-zinc-400">Enter the total in whole currency units (e.g., 185.00).</p>
            </div>
            <div>
              <label htmlFor="manual-created-at" className="mb-1 block text-sm font-medium text-zinc-200">
                MakerWorks created at
              </label>
              <input
                id="manual-created-at"
                type="datetime-local"
                value={makerworksCreatedAt}
                onChange={(event) => setMakerworksCreatedAt(event.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
              />
            </div>
            <div>
              <label htmlFor="manual-customer-email" className="mb-1 block text-sm font-medium text-zinc-200">
                Customer email
              </label>
              <input
                id="manual-customer-email"
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="customer@example.com"
                className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
              />
            </div>
            <div>
              <label htmlFor="manual-fulfillment-status" className="mb-1 block text-sm font-medium text-zinc-200">
                Fulfillment status
              </label>
              <select
                id="manual-fulfillment-status"
                value={fulfillmentStatus}
                onChange={(event) => setFulfillmentStatus(event.target.value as FulfillmentQueryValue)}
                className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
              >
                {FULFILLMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="manual-user-id" className="mb-1 block text-sm font-medium text-zinc-200">
                User id (optional)
              </label>
              <input
                id="manual-user-id"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder="user_manual_001"
                className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
              />
            </div>
            <div>
              <label htmlFor="manual-notes" className="mb-1 block text-sm font-medium text-zinc-200">
                Notes
              </label>
              <textarea
                id="manual-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
              />
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Line items</h3>
                <p className="text-xs text-zinc-400">Track each fabrication task and its pricing.</p>
              </div>
              <button
                type="button"
                onClick={handleAddLineItem}
                className="rounded-md border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
              >
                Add line
              </button>
            </div>
            <div className="space-y-4">
              {lineItems.map((item, index) => (
                <div key={index} className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">Line {index + 1}</p>
                    {lineItems.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveLineItem(index)}
                        className="text-xs font-medium text-zinc-300 transition hover:text-white"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-zinc-300">Description</label>
                      <input
                        value={item.description}
                        onChange={(event) =>
                          setLineItems((items) =>
                            items.map((existing, idx) =>
                              idx === index ? { ...existing, description: event.target.value } : existing,
                            ),
                          )
                        }
                        placeholder="3D printed enclosure"
                        className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-300">Quantity</label>
                      <input
                        value={item.quantity}
                        onChange={(event) =>
                          setLineItems((items) =>
                            items.map((existing, idx) =>
                              idx === index ? { ...existing, quantity: event.target.value } : existing,
                            ),
                          )
                        }
                        type="number"
                        min="1"
                        step="1"
                        className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-300">Unit price</label>
                      <input
                        value={item.unitPrice}
                        onChange={(event) =>
                          setLineItems((items) =>
                            items.map((existing, idx) =>
                              idx === index ? { ...existing, unitPrice: event.target.value } : existing,
                            ),
                          )
                        }
                        inputMode="decimal"
                        placeholder="125.00"
                        className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-300">Material</label>
                      <input
                        value={item.material}
                        onChange={(event) =>
                          setLineItems((items) =>
                            items.map((existing, idx) =>
                              idx === index ? { ...existing, material: event.target.value } : existing,
                            ),
                          )
                        }
                        placeholder="PLA"
                        className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-300">Color</label>
                      <input
                        value={item.color}
                        onChange={(event) =>
                          setLineItems((items) =>
                            items.map((existing, idx) =>
                              idx === index ? { ...existing, color: event.target.value } : existing,
                            ),
                          )
                        }
                        placeholder="Smoke gray"
                        className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-zinc-300">Line item notes</label>
                      <textarea
                        value={item.notes}
                        onChange={(event) =>
                          setLineItems((items) =>
                            items.map((existing, idx) =>
                              idx === index ? { ...existing, notes: event.target.value } : existing,
                            ),
                          )
                        }
                        rows={2}
                        className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="manual-metadata" className="mb-1 block text-sm font-medium text-zinc-200">
                Metadata JSON
              </label>
              <textarea
                id="manual-metadata"
                value={metadataJson}
                onChange={(event) => setMetadataJson(event.target.value)}
                placeholder='{"priority":"rush","approximate_print_time_hours":4}'
                rows={4}
                className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
              />
              <p className="mt-1 text-xs text-zinc-500">Optional. Attach arbitrary MakerWorks metadata.</p>
            </div>
            <div>
              <label htmlFor="manual-shipping" className="mb-1 block text-sm font-medium text-zinc-200">
                Shipping JSON
              </label>
              <textarea
                id="manual-shipping"
                value={shippingJson}
                onChange={(event) => setShippingJson(event.target.value)}
                placeholder='{"service":"UPS Ground","tracking":null}'
                rows={4}
                className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
              />
              <p className="mt-1 text-xs text-zinc-500">Optional. Include carrier, address, or delivery notes.</p>
            </div>
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-md bg-gradient-to-r from-[#f6f6f6] to-[#cfcfcf] px-4 py-2 text-sm font-semibold text-[#111] shadow-[0_15px_40px_rgba(0,0,0,0.65)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Saving..." : "Create job"}
            </button>
            <p className="text-xs text-zinc-400">Jobs are appended to the end of the queue with a pending status.</p>
          </div>
        </form>
      </div>
    </div>
  );
}
