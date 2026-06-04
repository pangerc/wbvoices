import { db } from "@/lib/db";
import {
  suggestedTones,
  type InsertSuggestedTone,
  type SuggestedTone,
} from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export type SuggestedToneInput = Pick<
  InsertSuggestedTone,
  "title" | "description" | "voiceInstructions" | "isActive"
>;

export class SuggestedTonesService {
  async list(opts?: { activeOnly?: boolean }): Promise<SuggestedTone[]> {
    const query = db.select().from(suggestedTones);
    const rows = opts?.activeOnly
      ? await query
          .where(eq(suggestedTones.isActive, true))
          .orderBy(desc(suggestedTones.createdAt))
      : await query.orderBy(desc(suggestedTones.createdAt));
    return rows;
  }

  async getById(id: string): Promise<SuggestedTone | null> {
    const rows = await db
      .select()
      .from(suggestedTones)
      .where(eq(suggestedTones.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(input: SuggestedToneInput): Promise<SuggestedTone> {
    const [row] = await db
      .insert(suggestedTones)
      .values({
        title: input.title,
        description: input.description,
        voiceInstructions: input.voiceInstructions,
        isActive: input.isActive ?? true,
      })
      .returning();
    return row;
  }

  async update(
    id: string,
    input: Partial<SuggestedToneInput>,
  ): Promise<SuggestedTone | null> {
    const [row] = await db
      .update(suggestedTones)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(suggestedTones.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(suggestedTones)
      .where(eq(suggestedTones.id, id))
      .returning({ id: suggestedTones.id });
    return result.length > 0;
  }
}

export const suggestedTonesService = new SuggestedTonesService();
