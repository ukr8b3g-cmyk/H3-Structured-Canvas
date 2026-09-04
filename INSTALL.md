# Installation / インストール

## GitHubから導入（推奨）

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/ukr8b3g-cmyk/H3-Structured-Canvas.git ComfyUI-H3-Structured-Canvas
```

更新時:

```bash
cd ComfyUI/custom_nodes/ComfyUI-H3-Structured-Canvas
git pull
```

更新後はComfyUIを完全に再起動してください。

## ZIPから導入

GitHub運用を推奨します。ZIPを使う場合は、フォルダ構造が次になるように配置します。

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

ComfyUIを完全に終了して再起動し、ノード検索で以下を確認します。

```text
🧭 H3 Structured Canvas
🧩 H3 Structured Prompter
```

Category:

```text
MiniMax H3 / Structured Prompt
```

## 更新

ユーザープリセットを残す場合は、更新前に次を退避できます。

```text
user_presets/canvas_presets.json
user_presets/prompter_presets.json
```

## 問題がある場合

### ノードが表示されない

ComfyUI起動ログで `ComfyUI-H3-Structured-Canvas` のimport errorを確認してください。Python 3.10以降を想定しています。

### UIが古いまま表示される

`git pull` 後にComfyUIを完全再起動し、ブラウザを強制再読込してください。

```text
Ctrl + F5
```

### Durationを5秒にしたのにCore H3側が変わらない

Prompterの `length` 出力をCore MiniMax H3の `length` 入力へ接続してください。5秒はH3の `17k+5` グリッドに合わせて124 framesになります。

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
