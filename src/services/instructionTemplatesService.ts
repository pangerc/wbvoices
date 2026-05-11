import { db } from "@/lib/db";
import {
  instructionTemplates,
  type InstructionTemplate,
  type InsertInstructionTemplate,
} from "@/lib/db/schema";
import { eq, asc, desc } from "drizzle-orm";

export type InstructionTemplateInput = Pick<
  InsertInstructionTemplate,
  | "title"
  | "description"
  | "category"
  | "systemInstructions"
  | "exampleOutput"
  | "defaultPacing"
  | "defaultCta"
  | "defaultDurationSeconds"
  | "defaultMusicStyle"
  | "bestPractice"
  | "isActive"
  | "sortOrder"
>;

export class InstructionTemplatesService {
  async list(opts?: { activeOnly?: boolean }): Promise<InstructionTemplate[]> {
    const base = db.select().from(instructionTemplates);
    // Active list = curator order (sort_order asc); admin list = newest first.
    if (opts?.activeOnly) {
      return base
        .where(eq(instructionTemplates.isActive, true))
        .orderBy(
          asc(instructionTemplates.sortOrder),
          desc(instructionTemplates.createdAt),
        );
    }
    return base.orderBy(desc(instructionTemplates.createdAt));
  }

  async getById(id: string): Promise<InstructionTemplate | null> {
    const rows = await db
      .select()
      .from(instructionTemplates)
      .where(eq(instructionTemplates.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(input: InstructionTemplateInput): Promise<InstructionTemplate> {
    const [row] = await db
      .insert(instructionTemplates)
      .values({
        title: input.title,
        description: input.description,
        category: input.category ?? "general",
        systemInstructions: input.systemInstructions,
        exampleOutput: input.exampleOutput ?? null,
        defaultPacing: input.defaultPacing ?? null,
        defaultCta: input.defaultCta ?? null,
        defaultDurationSeconds: input.defaultDurationSeconds ?? null,
        defaultMusicStyle: input.defaultMusicStyle ?? null,
        bestPractice: input.bestPractice ?? null,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();
    return row;
  }

  async update(
    id: string,
    input: Partial<InstructionTemplateInput>,
  ): Promise<InstructionTemplate | null> {
    const [row] = await db
      .update(instructionTemplates)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(instructionTemplates.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(instructionTemplates)
      .where(eq(instructionTemplates.id, id))
      .returning({ id: instructionTemplates.id });
    return result.length > 0;
  }
}

export const instructionTemplatesService = new InstructionTemplatesService();
