import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Textarea, Group } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import useFile from "../../../store/useFile";
import { contentToJson, jsonToContent } from "../../../lib/utils/jsonAdapter";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // populate editor value when entering edit mode or when node changes
    if (editing) {
      setValue(normalizeNodeData(nodeData?.text ?? []));
      setError(null);
    }
  }, [editing, nodeData]);

  const applyEditToDocument = async (newText: string) => {
    if (!nodeData || !nodeData.path) return;

    setSaving(true);
    setError(null);
    try {
      // Attempt to parse as JSON first
      let parsedValue: any;
      try {
        parsedValue = JSON.parse(newText);
      } catch (err) {
        // Fallback: coerce booleans/numbers/strings
        if (newText === "true") parsedValue = true;
        else if (newText === "false") parsedValue = false;
        else if (!Number.isNaN(Number(newText))) parsedValue = Number(newText);
        else parsedValue = newText;
      }

      const contents = useFile.getState().getContents();
      const format = useFile.getState().getFormat();

      const jsonObj = await contentToJson(contents, format);

      // (graph update moved below — update after we set the new value)

      // Helper to set value at JSON path (array of keys / indexes)
      const setValueAtPath = (obj: any, path: Array<string | number>, val: any) => {
        let cur = obj;
        for (let i = 0; i < path.length; i++) {
          const key = path[i] as any;
          const isLast = i === path.length - 1;
          if (isLast) {
            cur[key] = val;
          } else {
            if (cur[key] === undefined || cur[key] === null) {
              const nextKey = path[i + 1];
              cur[key] = typeof nextKey === "number" ? [] : {};
            }
            cur = cur[key];
          }
        }
      };

      setValueAtPath(jsonObj, nodeData.path as Array<string | number>, parsedValue);

      // Now update the in-memory graph so the selected node reflects the new value immediately
      try {
        const jsonStringForGraph = JSON.stringify(jsonObj);
        useGraph.getState().setGraph(jsonStringForGraph);
  const nodes = useGraph.getState().nodes;
  const match = nodeData?.id ? nodes.find(n => n.id === nodeData.id) : nodes.find(n => JSON.stringify(n.path) === JSON.stringify(nodeData.path));
  if (match) useGraph.getState().setSelectedNode(match);
      } catch (e) {
        console.warn("Graph update after node edit failed", e);
      }

      const newContent = await jsonToContent(JSON.stringify(jsonObj), format);

      // Update the shared editor contents which will reflect on the left editor
      await useFile.getState().setContents({ contents: newContent, hasChanges: true });

      setEditing(false);
    } catch (err: any) {
      setError(err?.message || "Failed to apply edit");
      console.error("Failed to apply node edit:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Group>
              {editing ? (
                <>
                  <Button size="xs" variant="subtle" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button size="xs" onClick={() => applyEditToDocument(value)} loading={saving}>
                    Save
                  </Button>
                </>
              ) : (
                <Button size="xs" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
              <CloseButton onClick={onClose} />
            </Group>
          </Flex>
          <ScrollArea.Autosize mah={250} maw={600}>
            {editing ? (
              <div>
                <Textarea minRows={6} value={value} onChange={e => setValue(e.currentTarget.value)} />
                {error ? <Text fz="xs" color="red">{error}</Text> : null}
              </div>
            ) : (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            )}
          </ScrollArea.Autosize>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
