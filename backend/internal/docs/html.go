package docs

import (
	"fmt"
	"html"
	"net/http"
	"strings"
)

// HandlerHTML serves a self-contained documentation page.
func HandlerHTML(frontendURL, apiURL string) http.HandlerFunc {
	doc := Build(frontendURL, apiURL)
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = fmt.Fprint(w, renderHTML(doc))
	}
}

func renderHTML(doc Documentation) string {
	var b strings.Builder
	b.WriteString(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PathTrace Documentation</title>
<style>
:root { --bg:#f6f8fb; --panel:#fff; --text:#1a2332; --dim:#5a6a7e; --accent:#0ea5a0; --border:#e2e8f0; --mono:ui-monospace,Consolas,monospace; }
* { box-sizing:border-box; }
body { margin:0; font-family:system-ui,-apple-system,sans-serif; background:var(--bg); color:var(--text); line-height:1.6; }
.wrap { max-width:960px; margin:0 auto; padding:32px 20px 64px; }
header { margin-bottom:32px; padding-bottom:20px; border-bottom:1px solid var(--border); }
h1 { margin:0 0 6px; font-size:28px; }
.tag { color:var(--dim); font-size:15px; }
.links { margin-top:12px; font-size:14px; }
.links a { color:var(--accent); margin-right:16px; }
nav.toc { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:16px 20px; margin-bottom:28px; }
nav.toc h2 { margin:0 0 10px; font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--dim); }
nav.toc a { display:block; color:var(--accent); text-decoration:none; padding:4px 0; font-size:14px; }
section { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:20px 24px; margin-bottom:16px; }
section h2 { margin:0 0 12px; font-size:20px; }
section p { margin:0 0 10px; white-space:pre-wrap; font-size:14px; }
.group { margin-bottom:20px; }
.group h3 { font-size:16px; margin:0 0 10px; color:var(--dim); }
table { width:100%; border-collapse:collapse; font-size:13px; }
th,td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--border); vertical-align:top; }
th { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--dim); }
.method { font-family:var(--mono); font-weight:700; font-size:12px; }
.method-GET { color:#0ea5a0; } .method-POST { color:#6366f1; }
.method-PATCH { color:#e8910a; } .method-DELETE { color:#e34935; }
.path { font-family:var(--mono); font-size:12px; }
footer { margin-top:32px; font-size:12px; color:var(--dim); text-align:center; }
</style>
</head>
<body><div class="wrap">
<header>
<h1>`)
	b.WriteString(html.EscapeString(doc.Title))
	b.WriteString(`</h1>
<p class="tag">`)
	b.WriteString(html.EscapeString(doc.Tagline))
	b.WriteString(` · v`)
	b.WriteString(html.EscapeString(doc.Version))
	b.WriteString(`</p>
<div class="links">`)
	if doc.Links.Frontend != "" {
		b.WriteString(`<a href="`)
		b.WriteString(html.EscapeString(doc.Links.Frontend))
		b.WriteString(`">Frontend UI</a>`)
	}
	if doc.Links.API != "" {
		b.WriteString(`<a href="`)
		b.WriteString(html.EscapeString(doc.Links.API))
		b.WriteString(`">API</a>`)
	}
	if doc.Links.Repo != "" {
		b.WriteString(`<a href="`)
		b.WriteString(html.EscapeString(doc.Links.Repo))
		b.WriteString(`">GitHub</a>`)
	}
	b.WriteString(`<a href="/api/docs">JSON API</a>
</div></header>
<nav class="toc"><h2>Contents</h2>`)
	for _, s := range doc.Sections {
		b.WriteString(`<a href="#`)
		b.WriteString(html.EscapeString(s.ID))
		b.WriteString(`">`)
		b.WriteString(html.EscapeString(s.Title))
		b.WriteString(`</a>`)
	}
	b.WriteString(`<a href="#api">API Reference</a>
<a href="#ui">UI Routes</a>
<a href="#env">Environment Variables</a>
</nav>`)

	for _, s := range doc.Sections {
		b.WriteString(`<section id="`)
		b.WriteString(html.EscapeString(s.ID))
		b.WriteString(`"><h2>`)
		b.WriteString(html.EscapeString(s.Title))
		b.WriteString(`</h2><p>`)
		b.WriteString(html.EscapeString(s.Content))
		b.WriteString(`</p></section>`)
	}

	b.WriteString(`<section id="api"><h2>API Reference</h2>`)
	for _, g := range doc.EndpointRef {
		b.WriteString(`<div class="group"><h3>`)
		b.WriteString(html.EscapeString(g.Title))
		b.WriteString(`</h3><table><thead><tr><th>Method</th><th>Path</th><th>Summary</th></tr></thead><tbody>`)
		for _, e := range g.Endpoints {
			cls := "method method-" + e.Method
			b.WriteString(`<tr><td class="`)
			b.WriteString(cls)
			b.WriteString(`">`)
			b.WriteString(html.EscapeString(e.Method))
			b.WriteString(`</td><td class="path">`)
			b.WriteString(html.EscapeString(e.Path))
			b.WriteString(`</td><td>`)
			b.WriteString(html.EscapeString(e.Summary))
			if e.Description != "" {
				b.WriteString(` — `)
				b.WriteString(html.EscapeString(e.Description))
			}
			b.WriteString(`</td></tr>`)
		}
		b.WriteString(`</tbody></table></div>`)
	}
	b.WriteString(`</section>`)

	b.WriteString(`<section id="ui"><h2>UI Routes</h2><table><thead><tr><th>Path</th><th>Screen</th><th>Description</th></tr></thead><tbody>`)
	for _, u := range doc.UIRoutes {
		b.WriteString(`<tr><td class="path">`)
		b.WriteString(html.EscapeString(u.Path))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(u.Title))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(u.Description))
		b.WriteString(`</td></tr>`)
	}
	b.WriteString(`</tbody></table></section>`)

	b.WriteString(`<section id="env"><h2>Environment Variables</h2><table><thead><tr><th>Name</th><th>Description</th></tr></thead><tbody>`)
	for _, v := range doc.EnvVars {
		b.WriteString(`<tr><td class="path">`)
		b.WriteString(html.EscapeString(v.Name))
		b.WriteString(`</td><td>`)
		b.WriteString(html.EscapeString(v.Description))
		b.WriteString(`</td></tr>`)
	}
	b.WriteString(`</tbody></table></section>
<footer>PathTrace documentation · <a href="/api/docs">GET /api/docs</a> for machine-readable JSON</footer>
</div></body></html>`)
	return b.String()
}
