import re, sys

GUARD = '''

// --- Admin-only guard (non-admins see an "Admins only" message; inner page never mounts) ---
function AdminOnlyGuard({ children }) {
  const [access, setAccess] = React.useState('loading');
  React.useEffect(() => {
    let cancelled = false;
    base44.auth.me()
      .then((u) => { if (!cancelled) setAccess(u?.role === 'admin' ? 'admin' : 'denied'); })
      .catch(() => { if (!cancelled) setAccess('denied'); });
    return () => { cancelled = true; };
  }, []);
  if (access === 'loading') {
    return <div className="p-6 lg:p-8 max-w-3xl mx-auto text-sm text-stone-500">Loading...</div>;
  }
  if (access !== 'admin') {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="p-8 text-center border border-stone-800 rounded-xl bg-stone-900">
          <h2 className="text-lg font-semibold text-stone-200 mb-1">Admins only</h2>
          <p className="text-sm text-stone-500">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }
  return children;
}

export default function %(name)s() {
  return (
    <AdminOnlyGuard>
      <%(name)sPage />
    </AdminOnlyGuard>
  );
}
'''

for name in sys.argv[1:]:
    path = f'src/pages/{name}.jsx'
    src = open(path).read()
    if 'AdminOnlyGuard' in src:
        print(name, 'already guarded'); continue
    pat = f'export default function {name}('
    if src.count(pat) != 1:
        print(name, 'PATTERN NOT FOUND'); continue
    src = src.replace(pat, f'function {name}Page(')
    if not re.search(r"import\s*\{\s*base44\s*\}\s*from\s*'@/api/base44Client'", src):
        src = src.replace("import React", "import { base44 } from '@/api/base44Client';\nimport React", 1)
    if not re.search(r"^import React", src, re.M):
        src = "import React from 'react';\n" + src
    src = src.rstrip() + '\n' + GUARD % {'name': name}
    open(path, 'w').write(src)
    print(name, 'ok')
