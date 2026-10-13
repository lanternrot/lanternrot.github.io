# Local-preview shim, not part of the site.
#
# GitHub Pages pins Liquid 4.0.3, which still calls String#tainted?. Ruby 3.2
# removed object tainting, so the preview dies on Ruby 3.2+ ("undefined method
# 'tainted?'"). Restoring the methods as no-ops is exactly what tainting became.
# GitHub's own builder runs an old Ruby and never loads this file.
[:tainted?, :untrusted?].each do |name|
  Object.send(:define_method, name) { false } unless Object.method_defined?(name)
end
[:taint, :untaint, :trust, :untrust].each do |name|
  Object.send(:define_method, name) { self } unless Object.method_defined?(name)
end
