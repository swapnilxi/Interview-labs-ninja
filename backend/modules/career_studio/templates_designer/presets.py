"""Built-in template presets, expressed as the same structured "spec" the
Template Designer edits. These seed each user's editable template library on
first visit (so presets are editable/deletable like any custom template) and
double as a code fallback when the DB has none.

A *spec* is a small dict of visual knobs; render.py turns it into PDF-safe CSS:

  Resume spec:
    font:        'serif' | 'sans' | 'mono'      (body font)
    nameFont:    same set (optional; defaults to font)
    accent:      palette key (violet|emerald|blue|rose|amber|slate)
    density:     'compact' | 'normal' | 'relaxed'
    headerAlign: 'left' | 'center'
    headerStyle: 'plain' | 'rule' | 'band' | 'sidebar'
    nameColor:   'ink' | 'accent'
    heading: {   (section <h2>)
      color:     'ink' | 'accent' | 'muted'
      rule:      'none' | 'under' | 'leftbar'
      align:     'left' | 'center'
      font:      font set (optional; defaults to body font)
      uppercase: bool
      spacing:   'normal' | 'wide'
    }

  Portfolio spec:
    font:        'sans' | 'serif'
    accent:      palette key
    layout:      'stack' | 'centered' | 'card'
    background:  'linkx'|'modern3d'|'visionary'|'minimal'|'isometric'|'aurora'|'blueprint'|'dots'|'mesh'|'carbon'
"""

from __future__ import annotations

RESUME_PRESETS: list[dict] = [
    {"id": "classic", "name": "Classic", "spec": {
        "font": "serif", "accent": "violet", "density": "normal", "headerAlign": "center",
        "headerStyle": "rule", "nameColor": "ink",
        "heading": {"color": "ink", "rule": "under", "align": "left", "uppercase": True, "spacing": "normal"}}},
    {"id": "modern", "name": "Modern", "spec": {
        "font": "sans", "accent": "violet", "density": "normal", "headerAlign": "left",
        "headerStyle": "sidebar", "nameColor": "accent",
        "heading": {"color": "accent", "rule": "none", "align": "left", "uppercase": True, "spacing": "normal"}}},
    {"id": "compact", "name": "Compact", "spec": {
        "font": "sans", "accent": "violet", "density": "compact", "headerAlign": "left",
        "headerStyle": "plain", "nameColor": "ink",
        "heading": {"color": "ink", "rule": "under", "align": "left", "uppercase": True, "spacing": "normal"}}},
    {"id": "elegant", "name": "Elegant", "spec": {
        "font": "serif", "accent": "violet", "density": "normal", "headerAlign": "center",
        "headerStyle": "plain", "nameColor": "ink",
        "heading": {"color": "accent", "rule": "none", "align": "center", "uppercase": True, "spacing": "wide"}}},
    {"id": "executive", "name": "Executive", "spec": {
        "font": "sans", "accent": "violet", "density": "normal", "headerAlign": "left",
        "headerStyle": "band", "nameColor": "ink",
        "heading": {"color": "accent", "rule": "under", "align": "left", "uppercase": True, "spacing": "wide"}}},
    {"id": "minimalist", "name": "Minimalist", "spec": {
        "font": "sans", "accent": "violet", "density": "relaxed", "headerAlign": "left",
        "headerStyle": "plain", "nameColor": "ink",
        "heading": {"color": "muted", "rule": "none", "align": "left", "uppercase": True, "spacing": "wide"}}},
    {"id": "technical", "name": "Technical", "spec": {
        "font": "sans", "nameFont": "mono", "accent": "violet", "density": "normal", "headerAlign": "left",
        "headerStyle": "rule", "nameColor": "accent",
        "heading": {"color": "ink", "rule": "leftbar", "align": "left", "font": "mono", "uppercase": False, "spacing": "normal"}}},
]

PORTFOLIO_PRESETS: list[dict] = [
    {"id": "linkx", "name": "LinkX", "spec": {"font": "sans", "accent": "violet", "layout": "centered", "background": "linkx"}},
    {"id": "modern3d", "name": "Modern3D", "spec": {"font": "sans", "accent": "violet", "layout": "stack", "background": "modern3d"}},
    {"id": "visionary", "name": "Visionary", "spec": {"font": "sans", "accent": "violet", "layout": "stack", "background": "visionary"}},
    {"id": "minimal", "name": "Minimal", "spec": {"font": "sans", "accent": "violet", "layout": "card", "background": "minimal"}},
    {"id": "isometric", "name": "Isometric", "spec": {"font": "sans", "accent": "violet", "layout": "card", "background": "isometric"}},
    {"id": "aurora", "name": "Aurora", "spec": {"font": "sans", "accent": "violet", "layout": "card", "background": "aurora"}},
    {"id": "blueprint", "name": "Blueprint", "spec": {"font": "sans", "accent": "blue", "layout": "stack", "background": "blueprint"}},
    {"id": "dots", "name": "Dots", "spec": {"font": "sans", "accent": "violet", "layout": "card", "background": "dots"}},
    {"id": "mesh", "name": "Mesh", "spec": {"font": "sans", "accent": "violet", "layout": "card", "background": "mesh"}},
    {"id": "carbon", "name": "Carbon", "spec": {"font": "sans", "accent": "slate", "layout": "stack", "background": "carbon"}},
]


def presets_for(kind: str) -> list[dict]:
    return PORTFOLIO_PRESETS if kind == "portfolio" else RESUME_PRESETS
