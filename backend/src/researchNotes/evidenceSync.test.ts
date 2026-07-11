import assert from "node:assert/strict";
import test from "node:test";
import {
	hashText,
	planEvidenceSync,
	splitEvidenceParagraphs,
} from "./evidenceSync";

test("splitEvidenceParagraphs trims markdown into non-empty paragraphs", () => {
	assert.deepEqual(splitEvidenceParagraphs("  A\n\n\n B  \n\n"), ["A", "B"]);
});

test("planEvidenceSync preserves evidence ids when paragraphs shift", () => {
	const plan = planEvidenceSync(["new paragraph", "A", "B"], [
		{ id: "1", content_hash: hashText("A") },
		{ id: "2", content_hash: hashText("B") },
	]);

	assert.equal(plan.items[0]?.existingId, undefined);
	assert.equal(plan.items[1]?.existingId, "1");
	assert.equal(plan.items[2]?.existingId, "2");
	assert.deepEqual(plan.staleIds, []);
});

test("planEvidenceSync handles duplicate paragraph text deterministically", () => {
	const plan = planEvidenceSync(["A", "A", "A"], [
		{ id: "1", content_hash: hashText("A") },
		{ id: "2", content_hash: hashText("A") },
		{ id: "3", content_hash: hashText("old") },
	]);

	assert.equal(plan.items[0]?.existingId, "1");
	assert.equal(plan.items[1]?.existingId, "2");
	assert.equal(plan.items[2]?.existingId, undefined);
	assert.deepEqual(plan.staleIds, ["3"]);
});
