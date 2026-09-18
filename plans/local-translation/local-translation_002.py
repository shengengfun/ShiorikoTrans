"""One-off: point the translation settings at the shared components.

The local-engine panel and the model catalogue list now live in
`components/local-engine-panel.tsx` / `components/local-model-list.tsx` because
summarisation needs exactly the same UI.

Run: python plans/local-translation/local-translation_002.py
"""

from __future__ import annotations

import io
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "desktop" / "src" / "pages" / "settings" / "sections" / "translation.tsx"

PANEL = """\t\t\t{isLocalEndpoint(config) && (
\t\t\t\t<LocalEnginePanel
\t\t\t\t\tid="translationLocalEngine"
\t\t\t\t\ttitle={m.translationLocalTitle()}
\t\t\t\t\thint={m.translationLocalHint()}
\t\t\t\t\tmodel={config.model}
\t\t\t\t\tonBaseUrl={(url) => setConfig({ openaiBaseUrl: url })}
\t\t\t\t/>
\t\t\t)}
\t\t</div>
\t)
}

"""

MODELS_TAB = """function TranslateModelsTab() {
\tconst preference = usePreferenceProvider()

\treturn (
\t\t<SettingsGroup title={m.translateModels()}>
\t\t\t<LocalModelList
\t\t\t\tid="translateModels"
\t\t\t\tselected={preference.translationLlmConfig.model}
\t\t\t\tonSelect={(filename) => preference.setTranslationLlmConfig({ ...preference.translationLlmConfig, model: filename })}
\t\t\t/>
\t\t</SettingsGroup>
\t)
}

"""


def main() -> None:
    src = io.open(TARGET, encoding="utf-8").read()
    start = src.index("\t\t\t{isLocalEndpoint(config) && <LocalEnginePanel config={config}")
    src = src[:start] + PANEL + src[src.index("function TranslateModelsTab() {") :]

    body_start = src.index("function TranslateModelsTab() {")
    body_end = src.index("function OptionsTab() {")
    src = src[:body_start] + MODELS_TAB + src[body_end:]

    io.open(TARGET, "w", encoding="utf-8", newline="\n").write(src)
    print(f"rewrote {TARGET.name}: {len(src.splitlines())} lines")


if __name__ == "__main__":
    main()
