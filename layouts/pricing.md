{{- $pricing := site.Data.pricing -}}
{{- $tiers := $pricing.tiers | default slice -}}
# {{ .Title }}

> {{ .Params.lead }}
{{ if $tiers }}
| Plan | Monthly | Yearly | What you get |
| --- | --- | --- | --- |
{{ range $tiers }}| {{ .name }} | ${{ .monthly }} {{ .unit_m }} | ${{ .annual }} {{ .unit_a }} | {{ with .voices }}{{ . }} {{ cond (eq (string .) "1") "voice" "voices" }}; {{ end }}{{ delimit .features "; " }}{{ with .addon }}. {{ . }}{{ end }} |
{{ end }}
{{- else }}
{{- with $pricing.current_plan }}
## {{ .name }}: ${{ .price }} {{ .unit }}

{{ .blurb }} No card needed.
{{ range .features }}
- {{ . }}
{{- end }}
{{- end }}

{{ $pricing.coming }}
{{ end }}
## Every plan includes
{{ range .Params.included }}
- **{{ .title }}.** {{ .body }}
{{- end }}

## What happens at a limit
{{ range $pricing.limits }}
- **{{ .title }}.** {{ .body }}
{{- end }}

## Frequently Asked Questions {#questions}
{{ range .Params.faq }}
**{{ .q }}** {{ .a }}
{{ end }}
