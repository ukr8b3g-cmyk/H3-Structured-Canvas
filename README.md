# ComfyUI-H3-Structured-Canvas

**MiniMax H3向けの独立型Structured Prompt作成ノードです。** 5色のCanvasスロットでBBOXを描き、人物・物体・文字・グラフィックの意味情報と組み合わせて、H3へ直接渡せるHybrid Structured Promptを生成します。

> Version: `0.9.1-beta.2`  
> 状態: テスト版。ただし、入力検証・プリセット保存・後方互換処理・単体テストを含む配布品質の実装です。

## ノード

### 🧭 H3 Structured Canvas

- 0–1000正規化 `xyxy` BBOXを最大5個作成
- UI色: A=赤、B=青、C=黄、D=緑、E=マゼンタ
- UI色は識別用であり、H3へは送信しません
- BOXの描画、移動、四隅リサイズ、削除
- `1:1 / 16:9 / 9:16 / 4:3 / 3:4` 等の解像度プリセット
- `width / height` 外部入力による実行時上書き
- 三分割、中央線、四分割グリッド
- 組み込み・ユーザーCanvas Preset
- `H3_LAYOUT / layout_json / width / height` 出力

### 🧩 H3 Structured Prompter

- CanvasのA–Eと、各Elementの説明を結合
- `Subject / Object / Text / Graphic`（旧Auto設定は読込時に互換変換）
- Text専用 `Exact Text`
- Semantic Motion: Fade In / Slide In / Scale Up / Pop In / Grow Up / Grow Right / Radial Fill / Progress Fill / Start → End
- H3 Camera preset、速度、振幅
- Exact Text whitelistと追加文字抑制
- Hybrid / JSON Only / Natural Language
- Direct Prompt / H3 Context Envelope
- Verified `bbox` profileと、実験用Qwen `bbox_2d` profile
- `H3_PROMPT / H3_STRUCTURE / JSON_DEBUG / length` 出力
- DurationからH3有効フレーム数 `17k+5` を自動算出（5秒→124 frames）
- `Full frame / no letterbox` を既定で有効化

## 基本接続

```text
H3 Structured Canvas
        │ H3_LAYOUT
        ▼
H3 Structured Prompter
        │ H3_PROMPT (STRING)
        ├─ width / height  ← Canvas
        └─ length (INT)    ← Prompter
        ▼
MiniMax H3
```

Continuum専用ではありません。通常のMiniMax H3ワークフローでも使用できます。Continuumでは、`H3_PROMPT`を既存のPrompt入力へ接続します。

`layout_json` と `JSON_DEBUG` は確認・保存用のデバッグ出力です。通常の生成では接続不要です。

## Start / End trajectory

同じスロットを持つCanvasを2台使用します。

```text
Start Canvas ── layout ─────┐
                            ├─ H3 Structured Prompter
End Canvas ──── layout ─────┘  end_layout
```

Prompter側で対象スロットのMotionを `Start → End` にします。AはA、BはBとして対応付けられます。

## Typeの意味

| Type | 主な用途 | H3へ出す主なフィールド |
|---|---|---|
| Subject | 人物、動物、identityを維持する主体 | `id: "subject_*"`, `type: "obj"` |
| Object | 一般物体 | `id: "object_*"`, `type: "obj"` |
| Text | 画面内文字 | `type: "text"`, `text` |
| Graphic | 棒グラフ、円形ゲージ等 | `type: "graphic"`, `value` |

UI上のSubject/Objectは意味管理のため分けていますが、Verified profileでは実機テストに合わせて両方ともH3側へ `type:"obj"` としてシリアライズします。

Textでは表示文字をDescriptionへ混ぜず、`Exact Text`へ入力する方が安定します。

## Compact UI

通常のStatic要素では `Description / Type / Motion` だけを表示します。

- `Exact Text` はText時のみ表示
- `Value` はGraphicの値を使うMotion時のみ表示
- `Phase` は動きの順序指定が必要な時のみ表示
- Custom motion behaviorは折りたたみ
- Compiler / Schema / Reinforcement等はAdvanced内に収納

## Duration / length

PrompterのDurationは表示用だけではありません。24fpsを基準にH3の有効フレームグリッド `17k+5` へ切り上げ、`length`として出力します。

例:

```text
3秒 → 73 frames
5秒 → 124 frames
```

`length`をCore MiniMax H3の`length`へ接続してください。

## 既定コンパイル方式

```text
Compiler Mode     Hybrid
Output Format     Direct Prompt
Schema Profile    Verified Split · bbox
Reinforcement     Balanced
Full Frame        ON
```

出力例:

```text
{"aspect_ratio":"1:1","high_level_description":"...","layout":{"coordinate_space":"normalized_0_1000","bbox_format":"xyxy","boxes":[...]},"elements":[...],"motion":{...}}

Resolved layout and motion:
Treat every element ID as a stable identity...
Use the full canvas area. Do not add letterboxing, blank margins, an inset frame, or decorative borders.
```

JSONは要素・ID・BBOX・Animationを固定し、末尾の自然言語要約が左右関係、大小関係、動作順序、Exact Textを補強します。

## Schema Profile

### Verified Split · `bbox`（既定）

実機検証で使用した構造に近い形式です。

```json
{
  "layout": {
    "boxes": [
      {"slot": "subject_a", "bbox": [80, 120, 420, 940]}
    ]
  },
  "elements": [
    {"id": "subject_a", "type": "obj", "desc": "..."}
  ]
}
```

### Qwen Unified · `bbox_2d`（Experimental）

Qwen3-VL Grounding形式へ寄せたA/Bテスト用です。

```json
{
  "elements": [
    {
      "id": "subject_a",
      "type": "obj",
      "desc": "...",
      "bbox_2d": [80, 120, 420, 940]
    }
  ]
}
```

現段階では既定にしません。同一seed・複数seedで比較してください。

## 現在確認されている傾向

- X方向の配置: 強い
- BBOXサイズ差: 強い
- 複数Elementと任意ID: 有効
- `start_bbox / end_bbox`: 人物・物体で有効。ただし構図条件に依存
- Semantic Motion Graphics: `fade_in / scale_up / grow_up / radial_fill` 等が有効
- Y方向の厳密配置: Xより弱い
- `depth: 0.2` 等の数値Z指定: 有効性未確認のため未搭載
- フレーム単位の厳密な時間補間: 保証しない

このノードのBBOXは、latentへ直接適用するHard Maskではありません。Qwen系Text Encoderを介した**soft semantic grounding**です。

## Preset

Canvas PresetとPrompter Presetは別管理です。

- Canvas Preset: 解像度、BOX、グリッド
- Prompter Preset: Scene、Element Type、Description、Motion、Camera等

ComfyUIサーバーへ書き込める場合は、ノード内の `user_presets/` に保存します。書込み不可の場合はブラウザのlocalStorageへ自動フォールバックします。

## インストール

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/ukr8b3g-cmyk/H3-Structured-Canvas.git ComfyUI-H3-Structured-Canvas
```

更新:

```bash
cd ComfyUI/custom_nodes/ComfyUI-H3-Structured-Canvas
git pull
```

更新後はComfyUIを完全に再起動してください。詳細は [INSTALL.md](INSTALL.md) を参照してください。

外部Python依存はありません。

## テスト

```bash
python -m compileall -q .
PYTHONPATH=tests python -m unittest discover -s tests -p "test_*.py" -v
node --input-type=module --check < web/h3_structured_canvas.js
```

v0.9.1-beta.2では21件のPython単体テスト、JavaScript構文確認、Example JSON構文確認を通過しています。

## 独立性

- `ComfyUI-H3-Continuum`へのimportや依存はありません
- `Krea2-BBOX-Prompter`へのimportや依存はありません
- H3モデル本体やText Encoderを変更しません
- STRING出力のため、既存H3ノードへ通常接続できます

## English summary

A standalone ComfyUI layout and structured-prompt compiler for MiniMax H3. Draw up to five normalized BBOX regions, assign Subject/Object/Text/Graphic semantics and motion presets, then emit a Hybrid JSON plus natural-language H3 prompt. Duration also outputs a valid H3 `17k+5` frame length. It performs soft semantic grounding only; it is not a latent-space hard-control system.
