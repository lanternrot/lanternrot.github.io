# Local-preview shim, not part of the site.
#
# GitHub Pages pins Liquid 4.0.3, which still calls String#tainted? and
# String#untaint. Ruby 3.2 removed object tainting, so the preview dies on
# Ruby 3.2+ ("undefined method 'tainted?'"). Restoring the two methods as
# no-ops is exactly what tainting became. GitHub's own builder runs an old
# Ruby and never loads this file.
Object.send(:define_method, :tainted?) { false } unless Object.method_defined?(:tainted?)
Object.send(:define_method, :untaint) { self } unless Object.method_defined?(:untaint)
