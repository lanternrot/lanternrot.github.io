source "https://rubygems.org"

# Local preview only. GitHub Pages ignores this file and builds with its own
# pinned gem set; this mirrors that set so the preview matches.
#
#   bundle config set --local path vendor/bundle   # once
#   bundle install
#   bundle exec jekyll serve
gem "github-pages", group: :jekyll_plugins

# github-pages pins Jekyll 3.9, which predates Ruby 3.4+ moving these out of
# the standard library.
gem "csv"
gem "logger"
gem "base64"
gem "bigdecimal"
gem "webrick"

# Liquid 4.0.3 (pinned by github-pages) needs the removed taint API on Ruby 3.2+.
require_relative "tools/ruby4_compat" if RUBY_VERSION >= "3.2"
