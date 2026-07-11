import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDiff, type NoteGraph } from "./diff";
import type { ExtractionResult } from "./llm";

function emptyResult(): ExtractionResult {
	return {
		nodes: [],
		edges: [],
		company_roles: [],
		node_relations: [],
		aliases: [],
		clusters: [],
	};
}

const EMPTY_GRAPH: NoteGraph = { nodes: [], edges: [], roles: [] };

test("empty existing graph → everything is add, no removals", () => {
	const result: ExtractionResult = {
		...emptyResult(),
		nodes: [
			{
				key: "a",
				name: "대두",
				node_type: "commodity",
				description: "콩",
				evidence_ordinals: [1],
			},
		],
	};
	const items = buildDiff(result, EMPTY_GRAPH);
	assert.equal(items.length, 1);
	assert.equal(items[0]?.diffKind, "add");
});

test("node matched with changed description → modify + merge_into_node_id", () => {
	const result: ExtractionResult = {
		...emptyResult(),
		nodes: [
			{
				key: "a",
				name: "대두",
				node_type: "commodity",
				description: "새 설명",
				evidence_ordinals: [1],
			},
		],
	};
	const existing: NoteGraph = {
		nodes: [
			{
				id: "10",
				canonical_name: "대두",
				node_type: "commodity",
				description: "옛 설명",
			},
		],
		edges: [],
		roles: [],
	};
	const items = buildDiff(result, existing);
	const node = items.find((i) => i.candidateType === "node");
	assert.equal(node?.diffKind, "modify");
	assert.equal(
		(node?.payload as { merge_into_node_id?: string }).merge_into_node_id,
		"10",
	);
});

test("node matched with same description → unchanged", () => {
	const result: ExtractionResult = {
		...emptyResult(),
		nodes: [
			{
				key: "a",
				name: "대두",
				node_type: "commodity",
				description: "같음",
				evidence_ordinals: [1],
			},
		],
	};
	const existing: NoteGraph = {
		nodes: [
			{
				id: "10",
				canonical_name: "대두",
				node_type: "commodity",
				description: "같음",
			},
		],
		edges: [],
		roles: [],
	};
	const items = buildDiff(result, existing);
	assert.equal(
		items.find((i) => i.candidateType === "node")?.diffKind,
		"unchanged",
	);
});

test("existing node no longer produced → remove with existing_node_id", () => {
	const existing: NoteGraph = {
		nodes: [
			{
				id: "10",
				canonical_name: "폐기노드",
				node_type: "commodity",
				description: "",
			},
		],
		edges: [],
		roles: [],
	};
	const items = buildDiff(emptyResult(), existing);
	const removal = items.find((i) => i.diffKind === "remove");
	assert.ok(removal);
	assert.equal(removal?.candidateType, "node");
	assert.equal(
		(removal?.payload as { existing_node_id?: string }).existing_node_id,
		"10",
	);
});

test("edge matched by endpoint names + type", () => {
	const result: ExtractionResult = {
		...emptyResult(),
		nodes: [
			{
				key: "a",
				name: "대두",
				node_type: "commodity",
				description: "",
				evidence_ordinals: [],
			},
			{
				key: "b",
				name: "착유",
				node_type: "process",
				description: "",
				evidence_ordinals: [],
			},
		],
		edges: [
			{
				source_key: "b",
				target_key: "a",
				edge_type: "uses",
				description: "바뀐 설명",
				evidence_ordinals: [1],
			},
		],
	};
	const existing: NoteGraph = {
		nodes: [
			{
				id: "1",
				canonical_name: "대두",
				node_type: "commodity",
				description: "",
			},
			{
				id: "2",
				canonical_name: "착유",
				node_type: "process",
				description: "",
			},
		],
		edges: [
			{
				id: "99",
				source_name: "착유",
				target_name: "대두",
				edge_type: "uses",
				description: "옛 설명",
			},
		],
		roles: [],
	};
	const items = buildDiff(result, existing);
	const edge = items.find((i) => i.candidateType === "edge");
	assert.equal(edge?.diffKind, "modify");
	assert.equal(
		(edge?.payload as { existing_edge_id?: string }).existing_edge_id,
		"99",
	);
});
