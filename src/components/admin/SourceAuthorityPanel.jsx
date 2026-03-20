import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Shield, RefreshCw, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TIER_LABELS } from '@/lib/trendScoring';
import { toast } from 'sonner';
import { format } from 'date-fns';

const TIER_OPTIONS = [
    { value: 'tier1', label: 'Tier 1 — High authority' },
    { value: 'tier2', label: 'Tier 2 — Medium' },
    { value: 'tier3', label: 'Tier 3 — Low signal' },
];

function AuthRow({ record, onSave }) {
    const [editing, setEditing] = useState(false);
    const [tier, setTier] = useState(record.tier || 'tier2');
    const [saving, setSaving] = useState(false);

    const tierCfg = TIER_LABELS[record.tier] || TIER_LABELS.tier2;

    const handleSave = async () => {
        setSaving(true);
        await onSave(record.id, tier);
        setSaving(false);
        setEditing(false);
    };

    return (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-stone-800/50 last:border-0 hover:bg-stone-800/20 transition-colors">
            <div className="flex-1 min-w-0">
                <p className="text-sm font-mono text-stone-300 truncate">{record.domain}</p>
                {record.feed_name && <p className="text-[11px] text-stone-600 truncate">{record.feed_name}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
                {record.avg_importance != null && (
                    <span className="text-[10px] text-stone-600 hidden sm:block">avg {Math.round(record.avg_importance)}</span>
                )}
                {record.is_manual_override && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-amber-900/30 text-amber-600 rounded font-semibold">MANUAL</span>
                )}
                {editing ? (
                    <div className="flex items-center gap-2">
                        <Select value={tier} onValueChange={setTier}>
                            <SelectTrigger className="h-7 w-40 text-xs bg-stone-800 border-stone-700">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TIER_OPTIONS.map(o => (
                                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs px-2">
                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 text-xs px-2 text-stone-500">
                            Cancel
                        </Button>
                    </div>
                ) : (
                    <>
                        <span className={cn('text-[10px] px-2 py-0.5 rounded font-semibold', tierCfg.bg, tierCfg.color)}>
                            {tierCfg.label}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="h-7 text-xs px-2 text-stone-500 hover:text-stone-300">
                            Override
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}

export default function SourceAuthorityPanel() {
    const queryClient = useQueryClient();
    const [filterTier, setFilterTier] = useState('all');
    const [running, setRunning] = useState(false);
    const [showAll, setShowAll] = useState(false);

    const { data: records = [], isLoading, refetch } = useQuery({
        queryKey: ['source-authority', filterTier],
        queryFn: () => {
            const q = filterTier === 'all' ? {} : { tier: filterTier };
            return base44.entities.SourceAuthority.filter(q, '-authority_score', 200);
        },
        staleTime: 60000,
    });

    const handleSave = async (id, tier) => {
        const TIER_SCORES = { tier1: 100, tier2: 50, tier3: 15 };
        await base44.entities.SourceAuthority.update(id, {
            tier,
            authority_score: TIER_SCORES[tier],
            is_manual_override: true,
        });
        queryClient.invalidateQueries(['source-authority']);
        toast.success('Authority tier updated');
    };

    const handleSeedScoring = async () => {
        setRunning(true);
        try {
            const res = await base44.functions.invoke('scoreClusters', {});
            toast.success(`Scored ${res.data?.clusters_scored} clusters, seeded ${res.data?.domains_seeded} domains`);
            refetch();
        } catch (e) {
            toast.error(`Failed: ${e.message}`);
        }
        setRunning(false);
    };

    const tier1 = records.filter(r => r.tier === 'tier1').length;
    const tier2 = records.filter(r => r.tier === 'tier2').length;
    const tier3 = records.filter(r => r.tier === 'tier3').length;
    const manual = records.filter(r => r.is_manual_override).length;

    const displayed = showAll ? records : records.slice(0, 20);

    return (
        <Card className="border-stone-800 bg-stone-900 mb-6">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2 text-stone-200">
                        <Shield className="w-4 h-4 text-amber-400" />
                        Source Authority
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-stone-400">
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleSeedScoring} disabled={running} className="text-stone-300">
                            {running ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
                            Rescore Clusters
                        </Button>
                    </div>
                </div>

                {/* Stats + filter */}
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                    <div className="flex gap-3">
                        {[
                            { label: 'Tier 1', val: tier1, color: 'text-amber-400' },
                            { label: 'Tier 2', val: tier2, color: 'text-sky-400' },
                            { label: 'Tier 3', val: tier3, color: 'text-stone-500' },
                            { label: 'Manual', val: manual, color: 'text-amber-600' },
                        ].map(s => (
                            <div key={s.label} className="text-center">
                                <p className={cn('text-sm font-bold', s.color)}>{s.val}</p>
                                <p className="text-[10px] text-stone-600">{s.label}</p>
                            </div>
                        ))}
                    </div>
                    <div className="ml-auto">
                        <Select value={filterTier} onValueChange={setFilterTier}>
                            <SelectTrigger className="h-7 w-36 text-xs bg-stone-800 border-stone-700 text-stone-300">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-xs">All tiers</SelectItem>
                                <SelectItem value="tier1" className="text-xs">Tier 1 only</SelectItem>
                                <SelectItem value="tier2" className="text-xs">Tier 2 only</SelectItem>
                                <SelectItem value="tier3" className="text-xs">Tier 3 only</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-0">
                {isLoading ? (
                    <div className="flex items-center gap-2 py-6 justify-center text-stone-500">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                    </div>
                ) : records.length === 0 ? (
                    <div className="py-8 text-center">
                        <Shield className="w-8 h-8 text-stone-700 mx-auto mb-3" />
                        <p className="text-stone-500 text-sm">No domain authority records yet</p>
                        <p className="text-stone-600 text-xs mt-1">Run "Rescore Clusters" to auto-seed domains from active clusters</p>
                    </div>
                ) : (
                    <>
                        {displayed.map(rec => (
                            <AuthRow key={rec.id} record={rec} onSave={handleSave} />
                        ))}
                        {records.length > 20 && (
                            <button
                                onClick={() => setShowAll(v => !v)}
                                className="w-full py-2.5 text-xs text-stone-500 hover:text-stone-300 flex items-center justify-center gap-1 border-t border-stone-800"
                            >
                                {showAll ? <><ChevronUp className="w-3 h-3" />Show less</> : <><ChevronDown className="w-3 h-3" />Show all {records.length} domains</>}
                            </button>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}