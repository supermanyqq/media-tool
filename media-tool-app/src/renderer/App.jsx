import React, { useMemo, useRef, useState } from "react";
import { Button, Layout, List, Space, Typography, message } from "antd";

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

function guessMediaKind(fileName) {
  const lower = (fileName || "").toLowerCase();
  if (lower.match(/\.(mp3|wav|aac|m4a|flac|ogg)$/)) return "audio";
  return "video";
}

function toFileUrl(filePath) {
  if (!filePath) return "";
  const normalized = filePath.replace(/\\/g, "/");
  const url = /^[A-Za-z]:\//.test(normalized)
    ? `local:///${normalized}`
    : `local://${normalized}`;
  return encodeURI(url);
}

export default function App() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [audioById, setAudioById] = useState({});
  const [extracting, setExtracting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [subtitlesById, setSubtitlesById] = useState({});
  const [createdPaths, setCreatedPaths] = useState([]);
  const [mutedVideoById, setMutedVideoById] = useState({});
  const inputRef = useRef(null);
  const videoRef = useRef(null);
  const previewBoxRef = useRef(null);

  const selected = useMemo(
    () => items.find((x) => x.id === selectedId) || null,
    [items, selectedId]
  );
  const previewPath =
    selectedId && mutedVideoById[selectedId]?.path
      ? mutedVideoById[selectedId].path
      : selected?.path;
  const previewUrl = useMemo(() => toFileUrl(previewPath), [previewPath]);
  const extractedAudioPath = selectedId ? audioById[selectedId]?.path : "";
  const extractedAudioUrl = useMemo(
    () => toFileUrl(extractedAudioPath),
    [extractedAudioPath]
  );

  function addFiles(fileList) {
    const next = Array.from(fileList || []).map((f) => ({
      id: `${f.path || f.name}-${f.lastModified || Date.now()}`,
      name: f.name,
      path: f.path,
      kind: guessMediaKind(f.name),
    }));

    setItems((prev) => {
      const seen = new Set(prev.map((p) => p.path));
      const deduped = next.filter((n) => n.path && !seen.has(n.path));
      return [...deduped, ...prev];
    });

    if (!selectedId && next[0]?.id) setSelectedId(next[0].id);
  }

  function describeMediaError(mediaEl) {
    const err = mediaEl?.error;
    if (!err) return "未知错误";
    const codeMap = {
      1: "MEDIA_ERR_ABORTED（播放被中止）",
      2: "MEDIA_ERR_NETWORK（网络/读取错误）",
      3: "MEDIA_ERR_DECODE（解码失败，可能是编码不支持或文件损坏）",
      4: "MEDIA_ERR_SRC_NOT_SUPPORTED（资源不支持/路径不可读）",
    };
    return codeMap[err.code] || `MediaError code=${err.code}`;
  }

  async function extractAudio() {
    if (!selected?.path || selected.kind !== "video") return;
    setExtracting(true);
    try {
      const res = await window.electronAPI.extractAudio(
        selected.path,
        undefined,
        true
      );
      const outputPath = res?.outputPath;
      if (!outputPath) throw new Error("No outputPath");
      const muted = res?.muted === true;
      const muteError = res?.muteError || "";
      const mutedVideoPath = res?.mutedVideoPath || "";
      setAudioById((prev) => ({
        ...prev,
        [selectedId]: { path: outputPath },
      }));
      setCreatedPaths((prev) =>
        prev.includes(outputPath) ? prev : [...prev, outputPath]
      );
      if (mutedVideoPath) {
        setMutedVideoById((prev) => ({
          ...prev,
          [selectedId]: { path: mutedVideoPath },
        }));
        setCreatedPaths((prev) =>
          prev.includes(mutedVideoPath) ? prev : [...prev, mutedVideoPath]
        );
      }
      if (muted) {
        message.success("音频已分离，已生成静音视频并用于预览");
      } else if (muteError) {
        message.warning(muteError);
      } else {
        message.success("音频已分离");
      }
    } catch (e) {
      message.error("分离失败（ffmpeg 执行异常或文件不支持）");
    } finally {
      setExtracting(false);
    }
  }

  async function undoAll() {
    const toDelete = createdPaths.slice();
    try {
      try {
        const root = previewBoxRef.current;
        if (root) {
          const els = root.querySelectorAll("video,audio");
          els.forEach((el) => {
            try {
              el.pause();
              el.removeAttribute("src");
              el.load();
            } catch {
              // ignore
            }
          });
        }
      } catch {
        // ignore
      }

      if (toDelete.length) {
        const res = await window.electronAPI.deleteFiles(toDelete);
        const failed = (res?.results || []).filter((r) => !r.deleted);
        if (failed.length) {
          message.warning(
            `撤销完成：有 ${failed.length} 个文件未删除（可能被占用）`
          );
        } else {
          message.success("已撤销：删除生成文件并恢复预览");
        }
      } else {
        message.success("已撤销：删除生成文件并恢复预览");
      }
    } catch {
      message.error("撤销时删除文件失败（可能被占用或权限不足）");
    } finally {
      setPreviewError("");
      setAudioById({});
      setSubtitlesById({});
      setCreatedPaths([]);
      setMutedVideoById({});
    }
  }

  async function transcribeSubtitles() {
    if (!selectedId) return;
    const inputPath = audioById[selectedId]?.path;
    if (!inputPath) return;
    setTranscribing(true);
    try {
      const res = await window.electronAPI.transcribeSubtitles(inputPath);
      const outputPath = res?.outputPath;
      if (!outputPath) throw new Error("No outputPath");

      setSubtitlesById((prev) => ({
        ...prev,
        [selectedId]: { path: outputPath, text: res?.srtText || "" },
      }));
      setCreatedPaths((prev) =>
        prev.includes(outputPath) ? prev : [...prev, outputPath]
      );
      message.success("字幕识别完成（已生成 .srt）");
    } catch (e) {
      const msg =
        (e?.message && String(e.message)) ||
        "识别失败（请确认已安装 whisper / python -m whisper 可用）";
      message.error(msg);
    } finally {
      setTranscribing(false);
    }
  }

  async function copySubtitles() {
    if (!selectedId) return;
    const text = subtitlesById[selectedId]?.text || "";
    if (!text.trim()) {
      message.warning("暂无可复制的字幕内容");
      return;
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      message.success("字幕已复制到剪贴板");
    } catch {
      message.error("复制失败（可能被系统权限限制）");
    }
  }

  return (
    <Layout style={{ height: "100vh" }}>
      <Layout style={{ height: "100%" }}>
        <Sider
          width={320}
          theme="light"
          style={{ borderRight: "1px solid rgba(5,5,5,0.06)" }}
        >
          <div style={{ padding: 16 }}>
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Title level={5} style={{ margin: 0 }}>
                  导入文件
                </Title>
                <>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="video/*,audio/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <Button onClick={() => inputRef.current?.click()}>
                    导入
                  </Button>
                </>
              </div>

              <List
                size="small"
                bordered
                dataSource={items}
                locale={{ emptyText: "还没有导入任何视频/音频" }}
                renderItem={(item) => (
                  <List.Item
                    onClick={() => setSelectedId(item.id)}
                    style={{
                      cursor: "pointer",
                      background:
                        item.id === selectedId
                          ? "rgba(22,119,255,0.08)"
                          : undefined,
                    }}
                  >
                    <div style={{ width: "100%" }}>
                      <Text strong ellipsis style={{ width: "100%" }}>
                        {item.name}
                      </Text>
                      <div>
                        <Text type="secondary">
                          {item.kind === "audio" ? "音频" : "视频"}
                        </Text>
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            </Space>
          </div>
        </Sider>

        <Content style={{ padding: 16, height: "100%" }}>
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div>
                <Title level={5} style={{ margin: 0 }}>
                  预览
                </Title>
                <Text type="secondary">选择左侧文件后可预览与处理</Text>
              </div>

              <Space>
                <Button disabled={!createdPaths.length} onClick={undoAll}>
                  一键撤销
                </Button>
                <Button
                  type="primary"
                  loading={extracting}
                  disabled={!selected || selected.kind !== "video"}
                  onClick={extractAudio}
                >
                  分离音频
                </Button>
              </Space>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                border: "1px solid rgba(5,5,5,0.06)",
                borderRadius: 8,
                padding: 12,
                background: "white",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
              ref={previewBoxRef}
            >
              {!selected ? (
                <Text type="secondary">从左侧导入并选择一个文件开始</Text>
              ) : selected.kind === "audio" ? (
                <audio
                  key={selected.id}
                  controls
                  style={{ width: "100%" }}
                  src={previewUrl}
                  onError={(e) => {
                    const el = e.currentTarget;
                    setPreviewError(
                      `${describeMediaError(el)}\nURL: ${
                        el.currentSrc || previewUrl
                      }`
                    );
                  }}
                  onLoadedMetadata={() => setPreviewError("")}
                />
              ) : (
                <>
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <video
                      key={selected.id}
                      ref={videoRef}
                      controls
                      style={{
                        width: "100%",
                        height: "100%",
                        maxHeight: "100%",
                        objectFit: "contain",
                      }}
                      src={previewUrl}
                      onError={(e) => {
                        const el = e.currentTarget;
                        setPreviewError(
                          `${describeMediaError(el)}\nURL: ${
                            el.currentSrc || previewUrl
                          }`
                        );
                      }}
                      onLoadedMetadata={() => setPreviewError("")}
                    />
                  </div>

                  {!!extractedAudioPath && (
                    <div style={{ width: "100%" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text type="secondary">分离出的音频：</Text>
                        <Button
                          loading={transcribing}
                          disabled={!extractedAudioPath}
                          onClick={transcribeSubtitles}
                        >
                          识别字幕
                        </Button>
                      </div>
                      <audio
                        controls
                        style={{ width: "100%", marginTop: 6 }}
                        src={extractedAudioUrl}
                      />

                      {!!subtitlesById[selectedId]?.path && (
                        <div style={{ marginTop: 10 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 12,
                            }}
                          >
                            <Text type="secondary">
                              已生成字幕：{subtitlesById[selectedId].path}
                            </Text>
                            <Button
                              size="small"
                              onClick={copySubtitles}
                              disabled={!subtitlesById[selectedId]?.text?.trim()}
                            >
                              一键复制
                            </Button>
                          </div>
                          {!!subtitlesById[selectedId]?.text && (
                            <pre
                              style={{
                                marginTop: 6,
                                maxHeight: 180,
                                overflow: "auto",
                                padding: 10,
                                background: "rgba(5,5,5,0.03)",
                                borderRadius: 6,
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {subtitlesById[selectedId].text}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {!!selected && !!previewError && (
              <div style={{ marginTop: 8 }}>
                <Text type="danger">预览失败：{previewError}</Text>
              </div>
            )}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
