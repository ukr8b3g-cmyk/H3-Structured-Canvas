# H3 Structured Canvas

MiniMax H3向けの独立型ComfyUIカスタムノードです。Canvasで0–1000正規化BBOXを描き、人物・物体・文字・グラフィックの意味情報と組み合わせて、H3へ直接渡せるHybrid Structured Promptを生成します。

> Version: `0.9.2-beta.3`
>
> Structured BBOXは**soft semantic grounding**です。latentへ直接適用するHard Maskではなく、MiniMax H3のQwen系Text Encoderが構造化テキストとして解釈することを利用します。

## ノード

### 🧭 H3 Structured Canvas

- A–Eの5スロット
- 0–1000正規化 `xyxy` BBOX
- 描画・移動・四隅リサイズ・削除
- Resolution Preset / Custom Size
- Grid / Canvas Preset
- optional `width / height` input
- 出力は `layout / width / height`

`layout_json`は内部状態として保持しますが、通常の出力ソケットには表示しません。

### 🧩 H3 Structured Prompter

通常UIは次だけを中心にしています。

- Scene / Background
- Slot A–E
  - Description
  - Type: `Subject / Object / Text / Graphic`
  - Motion
  - 必要時のみ `Order / Exact Text / Value / Custom behavior`
- Camera
- Audio / Optional
- More Prompt Options
- Developer / Experimental

出力は**`prompt`のみ**です。MiniMax H3またはContinuumのprompt入力へ直接接続します。

Durationは持ちません。動画長はCore H3 / Continuum側で管理します。

### ↔ H3 Layout Transition

Start / End trajectoryを使う場合だけ追加する小さな補助ノードです。

```text
Start Canvas ─┐
              ├─ H3 Layout Transition ── H3 Structured Prompter
End Canvas ───┘
```

Prompterの該当Slotで `Start → End Layout` を選択します。通常の静的レイアウトではこのノードは不要です。

## 基本接続

```text
H3 Structured Canvas
  ├─ layout ───────────────→ H3 Structured Prompter ── prompt ─→ MiniMax H3 / Continuum
  ├─ width ─────────────────────────────────────────────────────→ width
  └─ height ────────────────────────────────────────────────────→ height
```

## Type

| UI Type | 用途 | model-facing type |
|---|---|---|
| Subject | 人物・動物などidentityを持つ主体 | `obj` |
| Object | 一般物体 | `obj` |
| Text | 正確な画面内文字 | `text` |
| Graphic | 棒グラフ・円形ゲージ等 | `graphic` |

`Subject / Object`はUI上の編集カテゴリです。H3へ渡す構造では、実機検証済みの`type:"obj"`へ変換します。

## Motion

### Subject / Object

- None
- Hold Position
- Start → End Layout
- Move Left → Right / Right → Left
- Move Top → Bottom / Bottom → Top
- Slide In from Left / Right / Top / Bottom
- Fade In
- Scale Up

### Text

- None / Hold
- Fade In / Out
- Slide In from 4 directions
- Scale Up / Down
- Pop In / Reveal

`Exact Text`はTextを選択した時だけ表示します。

### Graphic

- None / Hold
- Fade / Slide / Scale
- Grow Up / Down / Left / Right
- Radial Fill / Progress Fill
- Reveal

`Value (%)`はRadial Fill / Progress Fillでのみ表示します。

## Structured Prompt

既定は次です。

```text
Compiler: Hybrid
Output: Direct Prompt
Schema: Verified bbox
Reinforcement: Balanced
```

通常はDeveloper / Experimentalを開く必要はありません。

既定Hybridは、構造化JSONと短い自然言語補強を組み合わせます。

```json
{
  "layout": {
    "boxes": [
      {"slot":"subject_a","bbox":[80,120,420,940]}
    ]
  },
  "elements": [
    {"id":"subject_a","type":"obj","desc":"A young woman."}
  ]
}
```

重要な位置関係は自然言語でも補強します。

## 現在確認されている傾向

- X方向配置: 強い
- BBOXサイズ差: 強い
- 任意ID / 3対象: 有効
- Subject/Object `type:"obj"`: 実機使用済み
- Start / End trajectory: 有効だが構図依存
- Text / Graphic semantic animation: 有効
- Y方向の厳密配置: Xより弱い
- 数値 `depth / z`: 有効性未確認
- frame-perfect timing: 保証しない

## Install

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/ukr8b3g-cmyk/H3-Structured-Canvas.git ComfyUI-H3-Structured-Canvas
```

更新:

```bash
cd ComfyUI/custom_nodes/ComfyUI-H3-Structured-Canvas
git pull
```

その後ComfyUIを完全に再起動してください。外部Python依存はありません。

## Validation

```bash
python -m compileall -q .
PYTHONPATH=tests python -m unittest discover -s tests -p "test_*.py" -v
node --check web/h3_structured_canvas.js
```

## Independence

- ComfyUI-H3-Continuumへ依存しません
- Krea2-BBOX-Prompterへ依存しません
- H3モデルやText Encoderを変更しません
- Continuumでも通常H3でも同じ`prompt`出力を利用できます
