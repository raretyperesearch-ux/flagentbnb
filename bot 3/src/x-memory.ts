// =====================================================
// FLAGENT X ENGINE — MEMORY SYSTEM
// agent_memory + agent_relationships tables in Supabase
// =====================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

var SUPABASE_URL = "https://seartddspffufwiqzwvh.supabase.co";
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
var MAX_MEMORIES = 500;
var MAX_RELATIONSHIPS = 200;

export type MemoryType =
  | "trade_outcome"    // what happened with a trade
  | "meta_shift"       // narrative/meta observation
  | "self_reflection"  // learning from mistakes
  | "market_pattern"   // recurring pattern noticed
  | "ecosystem_data"   // BSC ecosystem data point
  | "curiosity"        // unanswered question or hunch
  | "interaction";     // notable X interaction

export interface Memory {
  id?: string;
  type: MemoryType;
  content: string;
  context?: string;       // what triggered this memory
  token_address?: string;
  token_symbol?: string;
  importance: number;      // 1-10 scale
  created_at?: string;
}

export interface Relationship {
  id?: string;
  handle: string;
  sentiment: "positive" | "neutral" | "negative" | "ignored";
  last_interaction: string;
  interaction_count: number;
  notes: string;           // what flagent remembers about them
  created_at?: string;
  updated_at?: string;
}

export class FlagentMemory {
  private db: SupabaseClient;

  constructor() {
    this.db = createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  // ── STORE A MEMORY ──

  async remember(mem: Memory): Promise<void> {
    try {
      await this.db.from("agent_memory").insert({
        type: mem.type,
        content: mem.content,
        context: mem.context || null,
        token_address: mem.token_address || null,
        token_symbol: mem.token_symbol || null,
        importance: mem.importance,
      });
    } catch (e) {
      console.error("[memory] store failed:", e);
    }
  }

  // ── RECALL RECENT MEMORIES BY TYPE ──

  async recall(type: MemoryType, limit: number = 10): Promise<Memory[]> {
    try {
      var { data } = await this.db
        .from("agent_memory")
        .select("*")
        .eq("type", type)
        .order("created_at", { ascending: false })
        .limit(limit);
      return (data || []) as Memory[];
    } catch (e) {
      return [];
    }
  }

  // ── RECALL ALL RECENT MEMORIES (FOR CONTEXT WINDOW) ──

  async recallRecent(limit: number = 20): Promise<Memory[]> {
    try {
      var { data } = await this.db
        .from("agent_memory")
        .select("*")
        .order("importance", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      return (data || []) as Memory[];
    } catch (e) {
      return [];
    }
  }

  // ── SEARCH MEMORIES BY KEYWORD ──

  async search(keyword: string, limit: number = 5): Promise<Memory[]> {
    try {
      var { data } = await this.db
        .from("agent_memory")
        .select("*")
        .ilike("content", "%" + keyword + "%")
        .order("created_at", { ascending: false })
        .limit(limit);
      return (data || []) as Memory[];
    } catch (e) {
      return [];
    }
  }

  // ── GET TRADING CONTEXT (recent outcomes for self-awareness) ──

  async getTradingContext(): Promise<string> {
    var outcomes = await this.recall("trade_outcome", 5);
    var patterns = await this.recall("market_pattern", 3);
    var reflections = await this.recall("self_reflection", 3);

    var lines: string[] = [];

    if (outcomes.length > 0) {
      lines.push("RECENT TRADES:");
      for (var o of outcomes) lines.push("- " + o.content);
    }
    if (patterns.length > 0) {
      lines.push("PATTERNS NOTICED:");
      for (var p of patterns) lines.push("- " + p.content);
    }
    if (reflections.length > 0) {
      lines.push("SELF-REFLECTION:");
      for (var r of reflections) lines.push("- " + r.content);
    }

    return lines.join("\n");
  }

  // ── GET META CONTEXT (what narratives are hot) ──

  async getMetaContext(): Promise<string> {
    var metas = await this.recall("meta_shift", 5);
    var curiosities = await this.recall("curiosity", 3);

    var lines: string[] = [];

    if (metas.length > 0) {
      lines.push("CURRENT META:");
      for (var m of metas) lines.push("- " + m.content);
    }
    if (curiosities.length > 0) {
      lines.push("OPEN QUESTIONS:");
      for (var c of curiosities) lines.push("- " + c.content);
    }

    return lines.join("\n");
  }

  // ── RELATIONSHIP TRACKING ──

  async getRelationship(handle: string): Promise<Relationship | null> {
    try {
      var { data } = await this.db
        .from("agent_relationships")
        .select("*")
        .eq("handle", handle.toLowerCase())
        .single();
      return data as Relationship | null;
    } catch (e) {
      return null;
    }
  }

  async updateRelationship(
    handle: string,
    sentiment: Relationship["sentiment"],
    notes: string
  ): Promise<void> {
    try {
      var existing = await this.getRelationship(handle);
      if (existing) {
        await this.db
          .from("agent_relationships")
          .update({
            sentiment: sentiment,
            last_interaction: new Date().toISOString(),
            interaction_count: (existing.interaction_count || 0) + 1,
            notes: notes,
            updated_at: new Date().toISOString(),
          })
          .eq("handle", handle.toLowerCase());
      } else {
        await this.db.from("agent_relationships").insert({
          handle: handle.toLowerCase(),
          sentiment: sentiment,
          last_interaction: new Date().toISOString(),
          interaction_count: 1,
          notes: notes,
        });
      }
    } catch (e) {
      console.error("[memory] relationship update failed:", e);
    }
  }

  // ── CLEANUP OLD LOW-IMPORTANCE MEMORIES ──

  async cleanup(): Promise<void> {
    try {
      var { count } = await this.db
        .from("agent_memory")
        .select("*", { count: "exact", head: true });

      if (count && count > MAX_MEMORIES) {
        // delete oldest low-importance memories beyond limit
        var { data: oldMemories } = await this.db
          .from("agent_memory")
          .select("id")
          .lte("importance", 3)
          .order("created_at", { ascending: true })
          .limit(count - MAX_MEMORIES + 50);

        if (oldMemories && oldMemories.length > 0) {
          var ids = oldMemories.map(function (m: any) { return m.id; });
          await this.db.from("agent_memory").delete().in("id", ids);
          console.log("[memory] cleaned " + ids.length + " old memories");
        }
      }
    } catch (e) {
      console.error("[memory] cleanup failed:", e);
    }
  }

  // ── INGEST TRADE DATA FROM MAIN BOT (reads trades table) ──

  async ingestRecentTrades(): Promise<void> {
    try {
      // get last 10 confirmed trades
      var { data: trades } = await this.db
        .from("trades")
        .select("*")
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(10);

      if (!trades || trades.length === 0) return;

      // check what we already have memorized
      var existing = await this.recall("trade_outcome", 20);
      var existingTxs = new Set(existing.map(function (m) {
        var match = m.context?.match(/tx:(\w+)/);
        return match ? match[1] : "";
      }));

      for (var t of trades) {
        if (existingTxs.has(t.tx_hash)) continue;

        var content = t.side + " " + t.token_symbol +
          (t.side === "buy" ? " for " + t.amount_bnb + " BNB" : "") +
          " on " + t.platform;

        await this.remember({
          type: "trade_outcome",
          content: content,
          context: "tx:" + t.tx_hash,
          token_address: t.token_address,
          token_symbol: t.token_symbol,
          importance: t.side === "sell" ? 6 : 4,
        });
      }
    } catch (e) {
      console.error("[memory] trade ingest failed:", e);
    }
  }

  // ── GET STATS FOR SELF-AWARENESS ──

  async getStats(): Promise<{
    totalBuys: number;
    totalSells: number;
    openPositions: number;
    winRate: string;
    recentWins: number;
    recentLosses: number;
  }> {
    try {
      var [buysRes, sellsRes, openRes, closedRes] = await Promise.all([
        this.db.from("trades").select("*", { count: "exact", head: true }).eq("side", "buy").eq("status", "confirmed"),
        this.db.from("trades").select("*", { count: "exact", head: true }).eq("side", "sell").eq("status", "confirmed"),
        this.db.from("positions").select("*", { count: "exact", head: true }).eq("status", "open"),
        this.db.from("positions").select("pnl_percent").eq("status", "closed"),
      ]);

      var closed = closedRes.data || [];
      var wins = closed.filter(function (p: any) { return p.pnl_percent > 0; }).length;
      var losses = closed.filter(function (p: any) { return p.pnl_percent <= 0; }).length;
      var wr = closed.length > 0 ? Math.round((wins / closed.length) * 100) + "%" : "no data";

      return {
        totalBuys: buysRes.count || 0,
        totalSells: sellsRes.count || 0,
        openPositions: openRes.count || 0,
        winRate: wr,
        recentWins: wins,
        recentLosses: losses,
      };
    } catch (e) {
      return { totalBuys: 0, totalSells: 0, openPositions: 0, winRate: "unknown", recentWins: 0, recentLosses: 0 };
    }
  }
}
