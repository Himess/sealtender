"use client";

import { use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Lock,
  FileText,
  ExternalLink,
  BarChart3,
  Download,
  ShieldCheck,
} from "lucide-react";
import {
  useTenderAddress,
  useTenderConfig,
  useTenderState,
  useBidderCount,
  useTenderWinner,
  useRevealedPrice,
  useTenderSpec,
  useTenderCreator,
  stateLabel,
  stateColor,
  formatDateLong,
  formatIssueDate,
  formatDeadline,
  formatTenderRef,
  formatUsd6,
  formatNumber,
  categoryLabel,
  categorySector,
  parseConfig,
  parseSpec,
} from "@/hooks/useContractData";
import { TenderState } from "@/lib/contracts";

export default function TenderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const tenderId = BigInt(id);

  const { data: tenderAddress, isLoading: loadingAddr } =
    useTenderAddress(tenderId);
  const addr = tenderAddress as `0x${string}` | undefined;

  const { data: configData, isLoading: loadingConfig } = useTenderConfig(addr);
  const { data: specData } = useTenderSpec(tenderId);
  const { data: creator } = useTenderCreator(addr);
  const { data: state, isLoading: loadingState } = useTenderState(addr);
  const { data: bidders } = useBidderCount(addr);
  const { data: winner } = useTenderWinner(addr);
  const { data: price } = useRevealedPrice(addr);

  const isLoading = loadingAddr || loadingConfig || loadingState;
  const currentState = state !== undefined ? Number(state) : undefined;

  const config = configData ? parseConfig(configData) : null;
  const spec = specData ? parseSpec(specData) : null;
  const creatorAddr = (creator as `0x${string}` | undefined) ?? undefined;
  const tenderRef = formatTenderRef(Number(id), config?.deadline);
  const category = spec?.category;
  const sector = categorySector(category);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 max-w-5xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#1E2230] rounded-lg animate-pulse" />
          <div className="h-7 w-64 bg-[#1E2230] rounded animate-pulse" />
        </div>
        <div className="bg-[#FAFAFA] rounded-lg p-12 space-y-6">
          <div className="h-8 w-80 bg-[#E5E5E5] rounded animate-pulse" />
          <div className="h-4 w-full bg-[#E5E5E5] rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-[#E5E5E5] rounded animate-pulse" />
          <div className="grid grid-cols-4 gap-4 pt-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-[#E5E5E5] rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!addr || addr === "0x0000000000000000000000000000000000000000") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <FileText size={40} className="text-[#555555] mx-auto" />
          <p className="font-body text-[14px] text-[#666666]">
            Tender {tenderRef} not found
          </p>
          <Link
            href="/tenders"
            className="font-body text-[14px] text-[#00E87B] hover:text-[#00E87B]/80"
          >
            &larr; Back to Tenders
          </Link>
        </div>
      </div>
    );
  }

  const estimatedRange =
    spec && (spec.estimatedValueMin > 0n || spec.estimatedValueMax > 0n)
      ? `${formatUsd6(spec.estimatedValueMin)} – ${formatUsd6(
          spec.estimatedValueMax
        )}`
      : "Not disclosed";

  const totalWeight =
    (config?.weightYears ?? 0) +
    (config?.weightProjects ?? 0) +
    (config?.weightBond ?? 0);

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      {/* Action bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            href="/tenders"
            aria-label="Back to tenders"
            className="w-8 h-8 rounded-lg bg-[#0D0F14] border border-[#1E2230] flex items-center justify-center text-[#888888] hover:text-[#F0F0F0] hover:border-[#00E87B]/30 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="font-heading text-[22px] font-bold text-[#F0F0F0] leading-tight">
              Tender Document
            </h1>
            <p className="font-body text-[12px] text-[#666666] mt-0.5 font-mono">
              {tenderRef} &middot; {addr.slice(0, 10)}...{addr.slice(-8)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex px-3 py-1 rounded-full text-xs font-medium border ${stateColor(
              currentState
            )}`}
          >
            {stateLabel(currentState)}
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 px-3 py-[8px] bg-[#0D0F14] border border-[#1E2230] text-[#888888] rounded-[6px] text-xs hover:border-[#00E87B]/30 transition-colors"
          >
            <Download size={13} />
            Export PDF
          </button>
          {currentState === TenderState.Bidding && (
            <Link
              href={`/tenders/${id}/bid`}
              className="flex items-center gap-2 px-4 py-[8px] bg-[#00E87B] text-[#08090E] rounded-[6px] font-semibold text-xs hover:bg-[#00E87B]/90 transition-colors"
            >
              <Lock size={13} />
              Submit Encrypted Bid
            </Link>
          )}
          {currentState !== undefined &&
            currentState >= TenderState.Evaluating && (
              <Link
                href={`/tenders/${id}/results`}
                className="flex items-center gap-2 px-3 py-[8px] bg-[#0D0F14] border border-[#1E2230] text-[#888888] rounded-[6px] text-xs hover:border-[#00E87B]/30 transition-colors"
              >
                <BarChart3 size={13} />
                View Results
              </Link>
            )}
          <a
            href={`https://sepolia.etherscan.io/address/${addr}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-[8px] bg-[#0D0F14] border border-[#1E2230] text-[#888888] rounded-[6px] text-xs hover:border-[#00E87B]/30 transition-colors"
          >
            <ExternalLink size={13} />
            Etherscan
          </a>
        </div>
      </div>

      {/* Document */}
      <article className="bg-[#FAFAFA] rounded-lg shadow-lg overflow-hidden text-[#111111]">
        <div className="px-[56px] py-[48px] md:px-[72px] md:py-[64px]">
          {/* Document Header */}
          <header className="flex items-start justify-between pb-5 border-b-2 border-[#111111]">
            <div>
              <p className="font-heading text-[10px] font-bold tracking-[2px] uppercase text-[#111111]">
                SealTender Protocol
              </p>
              <p className="font-body text-[11px] text-[#666666] mt-1 tracking-[0.5px]">
                Encrypted Public Procurement System
              </p>
            </div>
            <div className="text-right">
              <p className="font-heading text-[10px] font-bold tracking-[2px] uppercase text-[#C02626]">
                Confidential Tender
              </p>
              <p className="font-body text-[11px] text-[#666666] font-mono mt-1">
                On-Chain Reference: {tenderRef}
              </p>
            </div>
          </header>

          {/* Title Block */}
          <section className="pt-8 pb-10">
            <p className="font-heading text-[11px] font-semibold tracking-[2px] uppercase text-[#666666]">
              Invitation to Bid
            </p>
            <h2 className="font-heading text-[32px] leading-[1.2] font-bold text-[#111111] mt-3">
              {config?.description || "Untitled Procurement"}
            </h2>
            <p className="font-body text-[14px] text-[#444444] mt-3">
              {categoryLabel(category)}
              {spec?.totalAreaM2 && spec.totalAreaM2 > 0n
                ? ` — ${formatNumber(spec.totalAreaM2)} m\u00B2`
                : ""}
              {spec?.completionDays && spec.completionDays > 0n
                ? ` — ${formatNumber(spec.completionDays)} calendar days`
                : ""}
            </p>
          </section>

          {/* Meta row */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-6 pb-10 border-b border-[#DDDDDD]">
            <div>
              <p className="font-heading text-[10px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                Issuing Authority
              </p>
              <p className="font-body text-[13px] text-[#111111] mt-1.5 font-mono break-all">
                {creatorAddr
                  ? `${creatorAddr.slice(0, 10)}...${creatorAddr.slice(-6)}`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="font-heading text-[10px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                Issue Date
              </p>
              <p className="font-body text-[13px] text-[#111111] mt-1.5">
                {formatIssueDate(config?.deadline)}
              </p>
            </div>
            <div>
              <p className="font-heading text-[10px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                Submission Deadline
              </p>
              <p className="font-body text-[13px] text-[#C02626] font-semibold mt-1.5">
                {formatDateLong(config?.deadline)}
              </p>
              <p className="font-body text-[11px] text-[#888888] mt-0.5">
                {formatDeadline(config?.deadline)}
              </p>
            </div>
            <div>
              <p className="font-heading text-[10px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                Estimated Value
              </p>
              <p className="font-body text-[13px] text-[#111111] font-semibold mt-1.5">
                {estimatedRange}
              </p>
            </div>
          </section>

          {/* Section 1: Scope of Work */}
          <section className="pt-10 pb-10 border-b border-[#DDDDDD]">
            <div className="flex items-center gap-3 mb-4">
              <span className="font-heading text-[11px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                Section 1
              </span>
              <span className="h-px flex-1 bg-[#DDDDDD]" />
            </div>
            <h3 className="font-heading text-[18px] font-bold text-[#111111] mb-3">
              Scope of Work
            </h3>
            <p className="font-body text-[13px] text-[#444444] leading-[1.7]">
              The contracting authority invites sealed bids from qualified,
              registered vendors for the delivery of{" "}
              <span className="text-[#111111] font-medium">
                {config?.description || "the procurement described herein"}
              </span>
              . All submissions shall comply with the specifications, standards,
              and evaluation procedures set forth in this document. The project
              encompasses the following requirements:
            </p>
            <ul className="mt-5 space-y-2.5">
              {spec && spec.totalAreaM2 > 0n && (
                <li className="flex items-start gap-3 font-body text-[13px] text-[#444444]">
                  <span className="text-[#888888] mt-1">&#9632;</span>
                  <span>
                    <span className="text-[#111111] font-medium">
                      Total constructed area:
                    </span>{" "}
                    {formatNumber(spec.totalAreaM2)} m&sup2;
                  </span>
                </li>
              )}
              {spec?.boqReference && (
                <li className="flex items-start gap-3 font-body text-[13px] text-[#444444]">
                  <span className="text-[#888888] mt-1">&#9632;</span>
                  <span>
                    <span className="text-[#111111] font-medium">
                      Bill of Quantities reference:
                    </span>{" "}
                    {spec.boqReference}
                  </span>
                </li>
              )}
              {spec?.standardsReference && (
                <li className="flex items-start gap-3 font-body text-[13px] text-[#444444]">
                  <span className="text-[#888888] mt-1">&#9632;</span>
                  <span>
                    <span className="text-[#111111] font-medium">
                      Applicable standards:
                    </span>{" "}
                    {spec.standardsReference}
                  </span>
                </li>
              )}
              {spec && spec.completionDays > 0n && (
                <li className="flex items-start gap-3 font-body text-[13px] text-[#444444]">
                  <span className="text-[#888888] mt-1">&#9632;</span>
                  <span>
                    <span className="text-[#111111] font-medium">
                      Completion period:
                    </span>{" "}
                    {formatNumber(spec.completionDays)} calendar days from the
                    Notice to Proceed
                  </span>
                </li>
              )}
              {spec && spec.liquidatedDamages > 0n && (
                <li className="flex items-start gap-3 font-body text-[13px] text-[#444444]">
                  <span className="text-[#888888] mt-1">&#9632;</span>
                  <span>
                    <span className="text-[#111111] font-medium">
                      Liquidated damages:
                    </span>{" "}
                    {formatUsd6(spec.liquidatedDamages)} per calendar day of
                    delay beyond the contractual deadline
                  </span>
                </li>
              )}
              {spec &&
                (spec.estimatedValueMin > 0n ||
                  spec.estimatedValueMax > 0n) && (
                  <li className="flex items-start gap-3 font-body text-[13px] text-[#444444]">
                    <span className="text-[#888888] mt-1">&#9632;</span>
                    <span>
                      <span className="text-[#111111] font-medium">
                        Estimated contract value range:
                      </span>{" "}
                      {estimatedRange}
                    </span>
                  </li>
                )}
              {(!spec ||
                (spec.totalAreaM2 === 0n &&
                  !spec.boqReference &&
                  !spec.standardsReference &&
                  spec.completionDays === 0n)) && (
                <li className="flex items-start gap-3 font-body text-[13px] text-[#666666] italic">
                  <span className="text-[#888888] mt-1">&#9632;</span>
                  <span>
                    Detailed technical specifications shall be provided upon
                    pre-qualification confirmation.
                  </span>
                </li>
              )}
            </ul>
          </section>

          {/* Section 2: Evaluation Criteria */}
          <section className="pt-10 pb-10 border-b border-[#DDDDDD]">
            <div className="flex items-center gap-3 mb-4">
              <span className="font-heading text-[11px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                Section 2
              </span>
              <span className="h-px flex-1 bg-[#DDDDDD]" />
            </div>
            <h3 className="font-heading text-[18px] font-bold text-[#111111] mb-3">
              Evaluation Criteria
            </h3>
            <p className="font-body text-[13px] text-[#444444] leading-[1.7] mb-5">
              Bids shall be evaluated on the basis of the following weighted
              criteria and pass/fail eligibility gates. All computations are
              performed on encrypted bid data via Fully Homomorphic Encryption;
              no plaintext bid values are revealed during evaluation.
            </p>

            <div className="border border-[#DDDDDD] rounded overflow-hidden">
              <table className="w-full text-left font-body text-[12px]">
                <thead className="bg-[#F0F0F0]">
                  <tr>
                    <th className="px-4 py-3 font-heading text-[10px] font-bold tracking-[1px] uppercase text-[#111111] border-b border-[#DDDDDD]">
                      Criterion
                    </th>
                    <th className="px-4 py-3 font-heading text-[10px] font-bold tracking-[1px] uppercase text-[#111111] border-b border-[#DDDDDD]">
                      Weight
                    </th>
                    <th className="px-4 py-3 font-heading text-[10px] font-bold tracking-[1px] uppercase text-[#111111] border-b border-[#DDDDDD]">
                      Minimum Threshold
                    </th>
                    <th className="px-4 py-3 font-heading text-[10px] font-bold tracking-[1px] uppercase text-[#111111] border-b border-[#DDDDDD]">
                      Method
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#EEEEEE]">
                    <td className="px-4 py-3 text-[#111111] font-medium">
                      Bid Price (USD)
                    </td>
                    <td className="px-4 py-3 text-[#444444]">
                      Primary criterion
                    </td>
                    <td className="px-4 py-3 text-[#444444]">
                      Within estimated range
                    </td>
                    <td className="px-4 py-3 text-[#444444]">Lowest wins</td>
                  </tr>
                  <tr className="border-b border-[#EEEEEE]">
                    <td className="px-4 py-3 text-[#111111] font-medium">
                      Years of Experience in {sector}
                    </td>
                    <td className="px-4 py-3 text-[#444444]">
                      {config?.weightYears ?? 0}%
                      {totalWeight > 0 && (
                        <span className="text-[#888888]">
                          {" "}
                          (of {totalWeight}%)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#444444]">
                      {config?.minYears ?? 0} years
                    </td>
                    <td className="px-4 py-3 text-[#444444]">Pass / Fail</td>
                  </tr>
                  <tr className="border-b border-[#EEEEEE]">
                    <td className="px-4 py-3 text-[#111111] font-medium">
                      Similar Projects Completed
                    </td>
                    <td className="px-4 py-3 text-[#444444]">
                      {config?.weightProjects ?? 0}%
                    </td>
                    <td className="px-4 py-3 text-[#444444]">
                      {config?.minProjects ?? 0} projects
                    </td>
                    <td className="px-4 py-3 text-[#444444]">Pass / Fail</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-[#111111] font-medium">
                      Surety Bond Capacity (USD)
                    </td>
                    <td className="px-4 py-3 text-[#444444]">
                      {config?.weightBond ?? 0}%
                    </td>
                    <td className="px-4 py-3 text-[#444444]">
                      {config?.minBond && config.minBond > 0n
                        ? formatUsd6(config.minBond * 1_000_000n)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-[#444444]">Pass / Fail</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 3: Submission Requirements */}
          <section className="pt-10 pb-10 border-b border-[#DDDDDD]">
            <div className="flex items-center gap-3 mb-4">
              <span className="font-heading text-[11px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                Section 3
              </span>
              <span className="h-px flex-1 bg-[#DDDDDD]" />
            </div>
            <h3 className="font-heading text-[18px] font-bold text-[#111111] mb-3">
              Bid Submission Requirements
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5">
              <div className="space-y-4">
                <div>
                  <p className="font-heading text-[10px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                    Escrow Deposit Required
                  </p>
                  <p className="font-body text-[14px] text-[#111111] mt-1">
                    {config?.escrowAmount && config.escrowAmount > 0n
                      ? formatUsd6(config.escrowAmount)
                      : "Waived for this tender"}
                  </p>
                </div>
                <div>
                  <p className="font-heading text-[10px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                    Maximum Bidders
                  </p>
                  <p className="font-body text-[14px] text-[#111111] mt-1">
                    {config ? String(config.maxBidders) : "—"}{" "}
                    <span className="text-[#666666] text-[12px]">
                      (currently {bidders !== undefined ? String(bidders) : 0}{" "}
                      registered)
                    </span>
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="font-heading text-[10px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                    Minimum Reputation Score
                  </p>
                  <p className="font-body text-[14px] text-[#111111] mt-1">
                    {config
                      ? `${String(config.minReputation)} / 100`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="font-heading text-[10px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                    Submission Deadline
                  </p>
                  <p className="font-body text-[14px] text-[#C02626] font-semibold mt-1">
                    {formatDateLong(config?.deadline)}
                  </p>
                </div>
              </div>
            </div>

            <p className="font-body text-[12px] text-[#666666] leading-[1.7] mt-6">
              All bids must be submitted in encrypted form via the SealTender
              smart contract prior to the submission deadline. Late, unencrypted,
              or improperly formatted submissions shall be rejected without
              consideration.
            </p>
          </section>

          {/* Section 4: Encryption & Confidentiality */}
          <section className="pt-10 pb-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="font-heading text-[11px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                Section 4
              </span>
              <span className="h-px flex-1 bg-[#DDDDDD]" />
            </div>
            <h3 className="font-heading text-[18px] font-bold text-[#111111] mb-3">
              Encryption &amp; Confidentiality
            </h3>
            <p className="font-body text-[13px] text-[#444444] leading-[1.75]">
              All bid data is encrypted using{" "}
              <span className="text-[#111111] font-medium">
                Fully Homomorphic Encryption (FHE)
              </span>{" "}
              via the Zama Protocol on the Ethereum blockchain. The evaluation
              is computed entirely on encrypted data &mdash; no plaintext bid
              information is accessible to any party, including the contracting
              authority, blockchain validators, or third-party observers, at any
              point during the evaluation process.
            </p>
            <p className="font-body text-[13px] text-[#444444] leading-[1.75] mt-4">
              Upon completion of the evaluation, only the winning bidder&rsquo;s
              identity and bid price shall be decrypted via the KMS threshold
              mechanism (9-of-13 multi-party computation). All non-winning bids
              shall remain permanently encrypted and are not subject to
              disclosure under any circumstances.
            </p>
          </section>

          {/* Blue info box */}
          <section className="bg-[#EAF2FB] border-l-4 border-[#2B68B3] rounded-sm px-6 py-5 flex items-start gap-4">
            <ShieldCheck
              size={20}
              className="text-[#2B68B3] shrink-0 mt-0.5"
              strokeWidth={2}
            />
            <div>
              <p className="font-heading text-[11px] font-bold tracking-[1.5px] uppercase text-[#2B68B3]">
                On-Chain Verification
              </p>
              <p className="font-body text-[12px] text-[#1E3A5F] leading-[1.7] mt-2">
                Smart contract address and evaluation logic are publicly
                verifiable on Etherscan. Any citizen may independently audit
                that the published evaluation criteria were applied correctly,
                without accessing confidential bid data.
              </p>
              <p className="font-body text-[11px] text-[#2B68B3] mt-3 font-mono break-all">
                Contract: {addr}
              </p>
            </div>
          </section>

          {/* Winner reveal (only when REVEALED) */}
          {currentState !== undefined &&
            currentState >= TenderState.Revealed &&
            winner &&
            winner !== "0x0000000000000000000000000000000000000000" && (
              <section className="mt-10 border-t-2 border-[#111111] pt-8">
                <p className="font-heading text-[11px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                  Notice of Award
                </p>
                <h3 className="font-heading text-[20px] font-bold text-[#111111] mt-2">
                  Successful Bidder
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5">
                  <div>
                    <p className="font-heading text-[10px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                      Awarded To
                    </p>
                    <p className="font-body text-[13px] text-[#111111] font-mono mt-1 break-all">
                      {winner as string}
                    </p>
                  </div>
                  <div>
                    <p className="font-heading text-[10px] font-semibold tracking-[1.5px] uppercase text-[#888888]">
                      Winning Price
                    </p>
                    <p className="font-body text-[13px] text-[#111111] font-semibold mt-1">
                      {formatUsd6(price as bigint | undefined)}
                    </p>
                  </div>
                </div>
              </section>
            )}

          {/* Footer */}
          <footer className="mt-12 pt-6 border-t border-[#DDDDDD] flex items-center justify-between">
            <p className="font-body text-[10px] text-[#888888]">
              SealTender Protocol &middot; FHE-Secured Public Procurement
            </p>
            <p className="font-body text-[10px] text-[#888888] font-mono">
              {tenderRef}
            </p>
          </footer>
        </div>
      </article>
    </div>
  );
}
