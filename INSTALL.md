# Installation / インストール

## GitHubから導入（推奨）

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/ukr8b3g-cmyk/-H3-Structured-Canvas.git ComfyUI-H3-Structured-Canvas
```

更新時:

```bash
cd ComfyUI/custom_nodes/ComfyUI-H3-Structured-Canvas
git pull
```

更新後はComfyUIを完全に再起動してください。

## ZIPから導入

1. `ComfyUI-H3-Structured-Canvas-0.9.0-beta1.zip` を解凍します。
2. フォルダ構造が次になるように配置します。

```text
ComfyUI/
└─ custom_nodes/
   └─ ComfyUI-H3-Structured-Canvas/
      ├─ __init__.py
      ├─ h3_structured_canvas/
      │  ├─ nodes.py
      │  ├─ compiler.py
      │  └─ schema.py
      └─ web/
         └─ h3_structured_canvas.js
```

3. ComfyUIを完全に終了して再起動します。
4. ノード検索で以下を確認します。

```text
🧭 H3 Structured Canvas
🧩 H3 Structured Prompter
```

Category:

```text
MiniMax H3 / Structured Prompt
```

## 更新

旧フォルダへ上書きする場合は、ComfyUIを停止してから行ってください。

ユーザープリセットを残す場合は、更新前に次を退避します。

```text
user_presets/canvas_presets.json
user_presets/prompter_presets.json
```

## 問題がある場合

### ノードが表示されない

ComfyUI起動ログで `ComfyUI-H3-Structured-Canvas` のimport errorを確認してください。Python 3.10以降を想定しています。

### UIが通常Widgetのまま表示される

ブラウザを強制再読込してください。

```text
Ctrl + F5
```

Frontendキャッシュが残る場合はComfyUIを停止し、ブラウザタブを閉じてから再起動します。

### Presetを保存できない

インストール先が読取専用の場合、ブラウザlocalStorageへ保存されます。別ブラウザや別プロファイルとは共有されません。

### Start → Endが動かない

- 2台目のCanvasを `end_layout` へ接続
- StartとEndで同じA–Eスロットを使用
- Prompter側のMotionを `Start → End`
- まず交差しない単一対象trajectoryで確認

## アンインストール

ComfyUI停止後、次のフォルダを削除します。

```text
ComfyUI/custom_nodes/ComfyUI-H3-Structured-Canvas
```
