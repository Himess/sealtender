"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseAbi, parseEther } from "viem";
import { ADDRESSES, TenderFactoryABI } from "@/lib/contracts";
import {
  ArrowLeft,
  FileText,
  Calendar,
  Rocket,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ClipboardList,
  Scale,
  Users,
  Eye,
  X,
} from "lucide-react";
import Link from "next/link";
import { Toast } from "@/components/Toast";

const factoryAbi = parseAbi(TenderFactoryABI);

// ----- Section component -----
function Section({
  step,
  icon: Icon,
  title,
  description,
  color,
  children,
}: {
  step: string;
  icon: React.ComponentType<{
    size?: number;
    className?: string;
    color?: string;
  }>;
  title: string;
  description: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[#0D0F14] border border-[#1E2230] rounded-lg overflow-hidden">
      <header className="px-6 py-4 border-b border-[#1E2230] flex items-start gap-4 bg-[#0A0C11]">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${color}15`, border: `1px solid ${color}30` }}
        >
          <Icon size={18} color={color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-heading text-[10px] font-bold tracking-[1.5px] uppercase text-[#666666]">
              {step}
            </span>
            <span className="h-px flex-1 bg-[#1E2230]" />
          </div>
          <h3 className="font-heading text-[15px] font-semibold text-[#F0F0F0] mt-1">
            {title}
          </h3>
          <p className="font-body text-[12px] text-[#666666] mt-0.5">
            {description}
          </p>
        </div>
      </header>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </section>
  );
}

function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block font-heading text-[10px] font-semibold text-[#888888] tracking-[1.5px] uppercase mb-1.5"
    >
      {children}
      {hint && (
        <span className="ml-2 font-body text-[10px] text-[#555555] normal-case tracking-normal font-normal">
          {hint}
        </span>
      )}
    </label>
  );
}

function Input({
  id,
  error,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  error?: string;
}) {
  return (
    <>
      <input
        id={id}
        className={`w-full px-3 py-2.5 bg-[#0C0D14] border rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none transition-colors ${
          error
            ? "border-[#FF4444]/50 focus:border-[#FF4444]"
            : "border-[#1E2230] focus:border-[#00E87B]/30"
        } ${className}`}
        {...props}
      />
      {error && (
        <p className="font-body text-[11px] text-[#FF4444] mt-1">{error}</p>
      )}
    </>
  );
}

// ----- Preview Modal -----
function PreviewModal({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: {
    description: string;
    deadline: string;
    category: string;
    totalAreaM2: string;
    estimatedValueMin: string;
    estimatedValueMax: string;
    boqReference: string;
    standardsReference: string;
    completionDays: string;
    liquidatedDamages: string;
    maxBidders: string;
    weightYears: string;
    weightProjects: string;
    weightBond: string;
    minYears: string;
    minProjects: string;
    minBond: string;
    escrowAmount: string;
    minReputation: string;
  };
}) {
  if (!open) return null;

  const formatUSD = (v: string) => {
    const n = parseFloat(v);
    if (!n || Number.isNaN(n)) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  };

  const ref = `ST-${new Date().getFullYear()}-PREVIEW`;
  const deadlineDate = data.deadline
    ? new Date(data.deadline).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Tender document preview"
    >
      <div className="bg-[#FAFAFA] text-[#111111] max-w-4xl w-full rounded-lg shadow-2xl my-8">
        {/* Toolbar */}
        <div className="sticky top-0 bg-[#0D0F14] text-[#F0F0F0] rounded-t-lg px-5 py-3 border-b border-[#1E2230] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-[#00E87B]" />
            <p className="font-heading text-[12px] font-semibold text-[#F0F0F0]">
              Document Preview
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="text-[#888888] hover:text-[#F0F0F0] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-[56px] py-[48px]">
          <header className="flex items-start justify-between pb-5 border-b-2 border-[#111111]">
            <div>
              <p className="font-heading text-[10px] font-bold tracking-[2px] uppercase">
                SealTender Protocol
              </p>
              <p className="font-body text-[11px] text-[#666666] mt-1">
                Encrypted Public Procurement System
              </p>
            </div>
            <div className="text-right">
              <p className="font-heading text-[10px] font-bold tracking-[2px] uppercase text-[#C02626]">
                Confidential Tender
              </p>
              <p className="font-body text-[11px] text-[#666666] font-mono mt-1">
                {ref}
              </p>
            </div>
          </header>

          <section className="pt-8 pb-10">
            <p className="font-heading text-[11px] font-semibold tracking-[2px] uppercase text-[#666666]">
              Invitation to Bid
            </p>
            <h2 className="font-heading text-[28px] leading-[1.2] font-bold mt-3">
              {data.description || "(No description)"}
            </h2>
            <p className="font-body text-[13px] text-[#444444] mt-3">
              {data.category.charAt(0).toUpperCase() + data.category.slice(1)}
              {data.totalAreaM2
                ? ` — ${Number(data.totalAreaM2).toLocaleString()} m\u00B2`
                : ""}
              {data.completionDays
                ? ` — ${data.completionDays} calendar days`
                : ""}
            </p>
          </section>

          <section className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-8 border-b border-[#DDDDDD]">
            <div>
              <p className="font-heading text-[9px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                Submission Deadline
              </p>
              <p className="font-body text-[12px] text-[#C02626] font-semibold mt-1.5">
                {deadlineDate}
              </p>
            </div>
            <div>
              <p className="font-heading text-[9px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                Estimated Value
              </p>
              <p className="font-body text-[12px] font-semibold mt-1.5">
                {formatUSD(data.estimatedValueMin)} –{" "}
                {formatUSD(data.estimatedValueMax)}
              </p>
            </div>
            <div>
              <p className="font-heading text-[9px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                Max Bidders
              </p>
              <p className="font-body text-[12px] font-semibold mt-1.5">
                {data.maxBidders || "—"}
              </p>
            </div>
            <div>
              <p className="font-heading text-[9px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                BOQ Reference
              </p>
              <p className="font-body text-[12px] font-semibold mt-1.5 truncate">
                {data.boqReference || "—"}
              </p>
            </div>
          </section>

          <section className="pt-8">
            <h3 className="font-heading text-[16px] font-bold mb-3">
              Evaluation Criteria
            </h3>
            <div className="border border-[#DDDDDD] rounded overflow-hidden">
              <table className="w-full text-left font-body text-[12px]">
                <thead className="bg-[#F0F0F0]">
                  <tr>
                    <th className="px-3 py-2 font-heading text-[9px] font-bold tracking-[1px] uppercase">
                      Criterion
                    </th>
                    <th className="px-3 py-2 font-heading text-[9px] font-bold tracking-[1px] uppercase">
                      Weight
                    </th>
                    <th className="px-3 py-2 font-heading text-[9px] font-bold tracking-[1px] uppercase">
                      Minimum
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#EEEEEE]">
                    <td className="px-3 py-2">Bid Price (USD)</td>
                    <td className="px-3 py-2 text-[#444444]">Primary</td>
                    <td className="px-3 py-2 text-[#444444]">Lowest wins</td>
                  </tr>
                  <tr className="border-b border-[#EEEEEE]">
                    <td className="px-3 py-2">Years of Experience</td>
                    <td className="px-3 py-2 text-[#444444]">
                      {data.weightYears || "0"}%
                    </td>
                    <td className="px-3 py-2 text-[#444444]">
                      {data.minYears || "0"} years
                    </td>
                  </tr>
                  <tr className="border-b border-[#EEEEEE]">
                    <td className="px-3 py-2">Past Projects</td>
                    <td className="px-3 py-2 text-[#444444]">
                      {data.weightProjects || "0"}%
                    </td>
                    <td className="px-3 py-2 text-[#444444]">
                      {data.minProjects || "0"} projects
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Surety Bond</td>
                    <td className="px-3 py-2 text-[#444444]">
                      {data.weightBond || "0"}%
                    </td>
                    <td className="px-3 py-2 text-[#444444]">
                      {data.minBond ? formatUSD(data.minBond) : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="pt-8 pb-4">
            <h3 className="font-heading text-[16px] font-bold mb-3">
              Encryption &amp; Confidentiality
            </h3>
            <p className="font-body text-[12px] text-[#444444] leading-[1.7]">
              All bid data is encrypted using Fully Homomorphic Encryption
              (FHE) via the Zama Protocol on Ethereum. The evaluation is
              computed entirely on encrypted data. Upon completion, only the
              winning bidder&rsquo;s identity and bid price shall be decrypted
              via the KMS threshold mechanism (9-of-13 MPC).
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function CreateTenderPage() {
  const router = useRouter();
  // Project Information
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("construction");
  const [deadline, setDeadline] = useState("");
  // Project Specifications
  const [totalAreaM2, setTotalAreaM2] = useState("");
  const [estimatedValueMin, setEstimatedValueMin] = useState("");
  const [estimatedValueMax, setEstimatedValueMax] = useState("");
  const [boqReference, setBoqReference] = useState("");
  const [standardsReference, setStandardsReference] = useState("");
  const [completionDays, setCompletionDays] = useState("");
  const [liquidatedDamages, setLiquidatedDamages] = useState("");
  // Evaluation Criteria
  const [weightYears, setWeightYears] = useState("30");
  const [weightProjects, setWeightProjects] = useState("30");
  const [weightBond, setWeightBond] = useState("40");
  const [minYears, setMinYears] = useState("2");
  const [minProjects, setMinProjects] = useState("3");
  const [minBond, setMinBond] = useState("5000");
  // Participation Requirements
  const [maxBidders, setMaxBidders] = useState("5");
  const [minReputation, setMinReputation] = useState("0");
  const [escrowAmount, setEscrowAmount] = useState("0");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const {
    writeContract,
    data: hash,
    isPending: isWriting,
    error: writeError,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Weight sum
  const totalWeight = useMemo(() => {
    const a = parseInt(weightYears) || 0;
    const b = parseInt(weightProjects) || 0;
    const c = parseInt(weightBond) || 0;
    return a + b + c;
  }, [weightYears, weightProjects, weightBond]);

  // Show toast on success or error
  useEffect(() => {
    if (isSuccess) {
      setToast({ message: "Tender issued successfully!", type: "success" });
    }
  }, [isSuccess]);

  useEffect(() => {
    if (writeError) {
      setToast({ message: writeError.message.slice(0, 100), type: "error" });
    }
  }, [writeError]);

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!description.trim()) {
      errs.description = "Description is required";
    }

    if (!deadline) {
      errs.deadline = "Deadline is required";
    } else {
      const dl = new Date(deadline).getTime() / 1000;
      if (dl <= Date.now() / 1000) {
        errs.deadline = "Deadline must be in the future";
      }
    }

    const mb = parseInt(maxBidders);
    if (isNaN(mb) || mb < 1 || mb > 10) {
      errs.maxBidders = "Maximum bidders must be between 1 and 10";
    }

    // Estimated value validation
    if (estimatedValueMin && estimatedValueMax) {
      const min = parseFloat(estimatedValueMin);
      const max = parseFloat(estimatedValueMax);
      if (!isNaN(min) && !isNaN(max) && max < min) {
        errs.estimatedValueMax =
          "Maximum value must be greater than or equal to minimum";
      }
    }

    // Completion days
    if (completionDays) {
      const cd = parseInt(completionDays);
      if (isNaN(cd) || cd <= 0) {
        errs.completionDays = "Completion days must be a positive integer";
      }
    }

    // Weights
    const wy = parseInt(weightYears) || 0;
    const wp = parseInt(weightProjects) || 0;
    const wb = parseInt(weightBond) || 0;
    if (wy < 0 || wp < 0 || wb < 0) {
      errs.weightYears = "Weights cannot be negative";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;

    const deadlineUnix = BigInt(
      Math.floor(new Date(deadline).getTime() / 1000)
    );

    const USD_DECIMALS = BigInt(1000000); // 6 decimals (USDC-style)

    const config = {
      description,
      deadline: deadlineUnix,
      weightYears: parseInt(weightYears) || 0,
      weightProjects: parseInt(weightProjects) || 0,
      weightBond: parseInt(weightBond) || 0,
      minYears: parseInt(minYears) || 0,
      minProjects: parseInt(minProjects) || 0,
      minBond: BigInt(minBond || "0"),
      // BidEscrow.deposit() compares msg.value (wei) against requiredDeposit,
      // so this MUST be ETH wei — not USD * 1e6.
      escrowAmount: parseEther(escrowAmount && escrowAmount.trim() !== "" ? escrowAmount : "0"),
      maxBidders: BigInt(parseInt(maxBidders) || 1),
      minReputation: BigInt(minReputation || "0"),
    };

    const spec = {
      category,
      totalAreaM2: BigInt(totalAreaM2 || "0"),
      estimatedValueMin: BigInt(estimatedValueMin || "0") * USD_DECIMALS,
      estimatedValueMax: BigInt(estimatedValueMax || "0") * USD_DECIMALS,
      boqReference: boqReference || "",
      standardsReference: standardsReference || "",
      completionDays: BigInt(completionDays || "0"),
      liquidatedDamages: BigInt(liquidatedDamages || "0") * USD_DECIMALS,
    };

    writeContract({
      address: ADDRESSES.TenderFactory,
      abi: factoryAbi,
      functionName: "createTender",
      args: [config, spec],
    });
  }

  if (isSuccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-14 h-14 rounded-lg bg-[#00E87B]/10 border border-[#00E87B]/20 flex items-center justify-center mx-auto">
            <CheckCircle size={28} className="text-[#00E87B]" />
          </div>
          <h2 className="font-heading text-[20px] font-bold text-[#F0F0F0]">
            Tender Issued
          </h2>
          <p className="font-body text-[14px] text-[#888888]">
            Your encrypted procurement tender has been deployed on-chain and
            is now part of the public register.
          </p>
          <p className="font-body text-[12px] text-[#666666] font-mono break-all">
            Tx: {hash}
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Link
              href="/tenders"
              className="px-5 py-[10px] bg-[#00E87B] text-[#08090E] rounded-[6px] font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors"
            >
              View Register
            </Link>
            <button
              onClick={() => router.push("/")}
              className="px-4 py-[10px] bg-[#0D0F14] border border-[#1E2230] text-[#888888] rounded-[6px] text-sm hover:border-[#00E87B]/30 transition-colors"
            >
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/tenders"
            aria-label="Back to tenders"
            className="w-8 h-8 rounded-lg bg-[#0D0F14] border border-[#1E2230] flex items-center justify-center text-[#888888] hover:text-[#F0F0F0] hover:border-[#00E87B]/30 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="font-heading text-[28px] font-bold text-[#F0F0F0]">
              Issue New Tender
            </h1>
            <p className="font-body text-[13px] text-[#666666] mt-0.5">
              Draft an official invitation to bid &middot; All data sealed with
              FHE prior to on-chain submission
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-2 px-4 py-[9px] bg-[#0D0F14] border border-[#1E2230] text-[#F0F0F0] rounded-[6px] text-xs font-medium hover:border-[#00E87B]/30 transition-colors"
          >
            <Eye size={14} />
            Preview Document
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {writeError && (
        <div className="bg-[#FF4444]/10 border border-[#FF4444]/20 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-[#FF4444] mt-0.5 shrink-0" />
          <div>
            <p className="font-body text-[14px] text-[#FF4444] font-medium">
              Transaction Failed
            </p>
            <p className="font-body text-[12px] text-[#888888] mt-1">
              {writeError.message.slice(0, 200)}
            </p>
          </div>
        </div>
      )}

      {/* Section 1: Project Information */}
      <Section
        step="Section 1"
        icon={FileText}
        title="Project Information"
        description="Official title, category, and submission window"
        color="#00E87B"
      >
        <div>
          <FieldLabel
            htmlFor="description"
            hint="Clear, public-facing description of the procurement"
          >
            Tender Description
          </FieldLabel>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Construction of a 540-day municipal sports complex including civil works, MEP installation, and site preparation"
            rows={4}
            className={`w-full px-3 py-2.5 bg-[#0C0D14] border rounded-lg font-body text-[14px] text-[#F0F0F0] placeholder-[#555555] focus:outline-none transition-colors resize-none ${
              errors.description
                ? "border-[#FF4444]/50 focus:border-[#FF4444]"
                : "border-[#1E2230] focus:border-[#00E87B]/30"
            }`}
          />
          {errors.description && (
            <p className="font-body text-[11px] text-[#FF4444] mt-1">
              {errors.description}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <FieldLabel htmlFor="category">Procurement Category</FieldLabel>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0C0D14] border border-[#1E2230] rounded-lg font-body text-[14px] text-[#F0F0F0] focus:outline-none focus:border-[#00E87B]/30 transition-colors"
            >
              <option value="construction">Construction</option>
              <option value="IT">Information Technology</option>
              <option value="furniture">Furniture &amp; Equipment</option>
              <option value="vehicle">Vehicles &amp; Transport</option>
            </select>
          </div>
          <div>
            <FieldLabel
              htmlFor="deadline"
              hint="Date and time bids must be received by"
            >
              <Calendar size={11} className="inline mr-1" />
              Submission Deadline
            </FieldLabel>
            <Input
              id="deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              error={errors.deadline}
            />
          </div>
        </div>
      </Section>

      {/* Section 2: Project Specifications */}
      <Section
        step="Section 2"
        icon={ClipboardList}
        title="Project Specifications"
        description="Technical scope, standards, and contractual terms"
        color="#FFB800"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <FieldLabel htmlFor="totalAreaM2" hint="0 if not applicable">
              Total Area (m&sup2;)
            </FieldLabel>
            <Input
              id="totalAreaM2"
              type="number"
              min={0}
              value={totalAreaM2}
              onChange={(e) => setTotalAreaM2(e.target.value)}
              placeholder="e.g. 12000"
            />
          </div>
          <div>
            <FieldLabel htmlFor="completionDays" hint="From Notice to Proceed">
              Completion Period (days)
            </FieldLabel>
            <Input
              id="completionDays"
              type="number"
              min={0}
              value={completionDays}
              onChange={(e) => setCompletionDays(e.target.value)}
              placeholder="e.g. 540"
              error={errors.completionDays}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <FieldLabel htmlFor="estimatedValueMin" hint="USD, whole number">
              Estimated Value — Minimum
            </FieldLabel>
            <Input
              id="estimatedValueMin"
              type="number"
              min={0}
              value={estimatedValueMin}
              onChange={(e) => setEstimatedValueMin(e.target.value)}
              placeholder="e.g. 2000000"
            />
          </div>
          <div>
            <FieldLabel htmlFor="estimatedValueMax" hint="USD, whole number">
              Estimated Value — Maximum
            </FieldLabel>
            <Input
              id="estimatedValueMax"
              type="number"
              min={0}
              value={estimatedValueMax}
              onChange={(e) => setEstimatedValueMax(e.target.value)}
              placeholder="e.g. 3000000"
              error={errors.estimatedValueMax}
            />
          </div>
        </div>

        <div>
          <FieldLabel
            htmlFor="boqReference"
            hint="Reference to the official Bill of Quantities"
          >
            Bill of Quantities (BOQ) Reference
          </FieldLabel>
          <Input
            id="boqReference"
            type="text"
            value={boqReference}
            onChange={(e) => setBoqReference(e.target.value)}
            placeholder="e.g. BOQ-Rev3-2026-001"
          />
        </div>

        <div>
          <FieldLabel
            htmlFor="standardsReference"
            hint="Applicable national and international standards"
          >
            Applicable Standards
          </FieldLabel>
          <Input
            id="standardsReference"
            type="text"
            value={standardsReference}
            onChange={(e) => setStandardsReference(e.target.value)}
            placeholder="e.g. ISO-9001, NFPA-13, ASHRAE 90.1, TS EN 1992-1-1"
          />
        </div>

        <div>
          <FieldLabel
            htmlFor="liquidatedDamages"
            hint="Penalty per day of delay beyond contractual deadline"
          >
            Liquidated Damages (USD/day)
          </FieldLabel>
          <Input
            id="liquidatedDamages"
            type="number"
            min={0}
            value={liquidatedDamages}
            onChange={(e) => setLiquidatedDamages(e.target.value)}
            placeholder="e.g. 500"
          />
        </div>
      </Section>

      {/* Section 3: Evaluation Criteria */}
      <Section
        step="Section 3"
        icon={Scale}
        title="Evaluation Criteria"
        description="Weighted scoring and pass/fail eligibility gates"
        color="#4A9FFF"
      >
        <div className="bg-[#0C0D14] rounded-lg p-4 mb-2">
          <p className="font-body text-[12px] text-[#888888] leading-[1.6]">
            Bid price is always the primary criterion (lowest valid bid wins).
            The following weights and minimum thresholds define supplementary
            pass/fail eligibility gates evaluated on encrypted bid data.
          </p>
        </div>

        <div className="space-y-1">
          <p className="font-heading text-[10px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
            Weights
            <span className="ml-2 font-body text-[10px] text-[#555555] normal-case tracking-normal font-normal">
              Current total: {totalWeight}%
              {totalWeight !== 100 && (
                <span className="text-[#FFB800]">
                  {" "}
                  (recommended sum: 100%)
                </span>
              )}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <FieldLabel htmlFor="weightYears">Years Weight (%)</FieldLabel>
            <Input
              id="weightYears"
              type="number"
              min={0}
              max={100}
              value={weightYears}
              onChange={(e) => setWeightYears(e.target.value)}
              error={errors.weightYears}
            />
          </div>
          <div>
            <FieldLabel htmlFor="weightProjects">
              Projects Weight (%)
            </FieldLabel>
            <Input
              id="weightProjects"
              type="number"
              min={0}
              max={100}
              value={weightProjects}
              onChange={(e) => setWeightProjects(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="weightBond">Bond Weight (%)</FieldLabel>
            <Input
              id="weightBond"
              type="number"
              min={0}
              max={100}
              value={weightBond}
              onChange={(e) => setWeightBond(e.target.value)}
            />
          </div>
        </div>

        <div className="pt-2">
          <p className="font-heading text-[10px] font-semibold tracking-[1.5px] uppercase text-[#888888] mb-2">
            Minimum Thresholds (pass / fail gates)
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <FieldLabel htmlFor="minYears" hint="Minimum years of experience">
              Min. Years
            </FieldLabel>
            <Input
              id="minYears"
              type="number"
              min={0}
              value={minYears}
              onChange={(e) => setMinYears(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel
              htmlFor="minProjects"
              hint="Minimum similar projects"
            >
              Min. Projects
            </FieldLabel>
            <Input
              id="minProjects"
              type="number"
              min={0}
              value={minProjects}
              onChange={(e) => setMinProjects(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="minBond" hint="USD, whole number">
              Min. Surety Bond
            </FieldLabel>
            <Input
              id="minBond"
              type="number"
              min={0}
              value={minBond}
              onChange={(e) => setMinBond(e.target.value)}
            />
          </div>
        </div>
      </Section>

      {/* Section 4: Participation Requirements */}
      <Section
        step="Section 4"
        icon={Users}
        title="Participation Requirements"
        description="Bidder limits, escrow, and reputation gates"
        color="#A855F7"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <FieldLabel htmlFor="maxBidders" hint="Hard cap 1–10">
              Maximum Bidders
            </FieldLabel>
            <Input
              id="maxBidders"
              type="number"
              min={1}
              max={10}
              value={maxBidders}
              onChange={(e) => setMaxBidders(e.target.value)}
              error={errors.maxBidders}
            />
          </div>
          <div>
            <FieldLabel
              htmlFor="minReputation"
              hint="0 disables reputation gate"
            >
              Min. Reputation (0-100)
            </FieldLabel>
            <Input
              id="minReputation"
              type="number"
              min={0}
              max={100}
              value={minReputation}
              onChange={(e) => setMinReputation(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="escrowAmount" hint="ETH, 0 to waive">
              Escrow Deposit
            </FieldLabel>
            <Input
              id="escrowAmount"
              type="number"
              step="0.001"
              min={0}
              value={escrowAmount}
              onChange={(e) => setEscrowAmount(e.target.value)}
            />
          </div>
        </div>
      </Section>

      {/* Deploy */}
      <div className="bg-[#0D0F14] border border-[#1E2230] rounded-lg p-6">
        <div className="flex items-center gap-2 font-body text-[14px] text-[#F0F0F0] font-medium mb-4">
          <Rocket size={16} className="text-[#FFB800]" />
          Deploy Tender to Blockchain
        </div>

        <div className="bg-[#0C0D14] rounded-lg p-4 space-y-2 text-xs mb-5">
          <div className="flex justify-between text-[#666666]">
            <span>Network</span>
            <span className="text-[#888888]">Sepolia Testnet</span>
          </div>
          <div className="flex justify-between text-[#666666]">
            <span>Encryption</span>
            <span className="text-[#00E87B]">Zama fhEVM (FHE)</span>
          </div>
          <div className="flex justify-between text-[#666666]">
            <span>Factory Contract</span>
            <span className="text-[#888888] font-mono">
              {ADDRESSES.TenderFactory.slice(0, 10)}...
              {ADDRESSES.TenderFactory.slice(-6)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-2 px-4 py-3 bg-[#0D0F14] border border-[#1E2230] text-[#F0F0F0] rounded-[6px] text-sm font-medium hover:border-[#00E87B]/30 transition-colors"
          >
            <Eye size={15} />
            Preview Document
          </button>
          <button
            onClick={handleSubmit}
            disabled={isWriting || isConfirming}
            className="flex-1 min-w-[220px] flex items-center justify-center gap-2 px-4 py-3 bg-[#00E87B] text-[#08090E] rounded-[6px] font-semibold text-sm hover:bg-[#00E87B]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isWriting || isConfirming ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {isWriting ? "Confirm in Wallet..." : "Confirming on-chain..."}
              </>
            ) : (
              <>
                <Rocket size={16} />
                Issue Tender
              </>
            )}
          </button>
        </div>
      </div>

      <PreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        data={{
          description,
          deadline,
          category,
          totalAreaM2,
          estimatedValueMin,
          estimatedValueMax,
          boqReference,
          standardsReference,
          completionDays,
          liquidatedDamages,
          maxBidders,
          weightYears,
          weightProjects,
          weightBond,
          minYears,
          minProjects,
          minBond,
          escrowAmount,
          minReputation,
        }}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={dismissToast}
        />
      )}
    </div>
  );
}
