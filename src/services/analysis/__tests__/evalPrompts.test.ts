import * as fs from "fs";
import * as path from "path";

jest.mock("../../prefs/prefsStore", () => ({ getUserProfile: () => null }));
jest.mock("../../cloud/measuredReview", () => ({ measuredReviewRequest: () => ({}) }));
jest.mock("../../cloud/speakerContext", () => ({ speakerContextForReview: () => "" }));

import { BRIDGE_CHAIN_SCHEMA, BRIDGE_CHAIN_SYSTEM, REWIND_NOTES_SCHEMA, REWIND_REVIEW_SYSTEM, WORD_CHAIN_SCHEMA, WORD_CHAIN_SYSTEM } from "../prompts";

// The hosted eval (spikes/inference-eval/eval.py) must test the prompts the
// app really sends. This file keeps app_prompts.json equal to them. After
// changing a prompt, run the tests once with UPDATE_EVAL_PROMPTS=1.

const FILE = path.join(__dirname, "..", "..", "..", "..", "spikes", "inference-eval", "app_prompts.json");

const current = {
  _about: "Generated from src/services/analysis/prompts.ts by evalPrompts.test.ts. Do not edit by hand.",
  rewind: { system: REWIND_REVIEW_SYSTEM, schema: REWIND_NOTES_SCHEMA },
  word_chain: { system: WORD_CHAIN_SYSTEM, schema: WORD_CHAIN_SCHEMA },
  bridge_chain: { system: BRIDGE_CHAIN_SYSTEM, schema: BRIDGE_CHAIN_SCHEMA },
};

describe("the eval's copy of the exercise prompts", () => {
  it("matches what the app sends", () => {
    const text = `${JSON.stringify(current, null, 2)}\n`;
    if (process.env.UPDATE_EVAL_PROMPTS === "1") fs.writeFileSync(FILE, text);
    expect(JSON.parse(fs.readFileSync(FILE, "utf8"))).toEqual(current);
  });
});
