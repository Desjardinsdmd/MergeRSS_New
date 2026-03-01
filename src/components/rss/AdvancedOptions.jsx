import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export default function AdvancedOptions({ options, onChange }) {
    const [open, setOpen] = useState(false);

    const update = (key, value) => onChange(prev => ({ ...prev, [key]: value }));

    return (
        <div className={cn("border rounded-lg overflow-hidden transition-colors", open ? "border-slate-200" : "border-slate-100")}>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
                <span className="font-medium">Advanced Options</span>
                {open
                    ? <ChevronUp className="w-4 h-4 text-slate-400" />
                    : <ChevronDown className="w-4 h-4 text-slate-400" />
                }
            </button>

            {open && (
                <div className="border-t border-slate-100 px-4 py-4 space-y-5 bg-slate-50/40">
                    {/* Frequency & Item Limit */}
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <Label className="text-xs text-slate-600 mb-1 block">Update Frequency</Label>
                            <Select value={options.refresh_frequency} onValueChange={v => update('refresh_frequency', v)}>
                                <SelectTrigger className="text-sm bg-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="5min">Every 5 minutes</SelectItem>
                                    <SelectItem value="15min">Every 15 minutes</SelectItem>
                                    <SelectItem value="1hour">Every hour</SelectItem>
                                    <SelectItem value="6hours">Every 6 hours</SelectItem>
                                    <SelectItem value="daily">Daily</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-xs text-slate-600 mb-1 block">Item Limit</Label>
                            <Select value={String(options.item_limit)} onValueChange={v => update('item_limit', Number(v))}>
                                <SelectTrigger className="text-sm bg-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10 items</SelectItem>
                                    <SelectItem value="25">25 items</SelectItem>
                                    <SelectItem value="50">50 items</SelectItem>
                                    <SelectItem value="100">100 items</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Include full content */}
                    <div className="flex items-center justify-between py-1">
                        <div>
                            <p className="text-sm font-medium text-slate-700">Include full content</p>
                            <p className="text-xs text-slate-400">Fetch full article body where available</p>
                        </div>
                        <Switch
                            checked={options.include_full_content}
                            onCheckedChange={v => update('include_full_content', v)}
                        />
                    </div>

                    {/* UTM Parameters */}
                    <div>
                        <Label className="text-xs text-slate-600 mb-1 block">UTM Parameters (optional)</Label>
                        <Input
                            className="text-sm bg-white"
                            placeholder="utm_source=mergerss&utm_medium=rss&utm_campaign=feed"
                            value={options.utm_params}
                            onChange={e => update('utm_params', e.target.value)}
                        />
                        <p className="text-xs text-slate-400 mt-1">
                            Appended to all article links in the generated feed
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}