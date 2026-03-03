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
                 className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
                 aria-expanded={open}
                 aria-label={`${open ? 'Hide' : 'Show'} advanced options`}
             >
                 <span className="font-medium">Advanced Options</span>
                 {open
                     ? <ChevronUp className="w-4 h-4 text-slate-400" aria-hidden="true" />
                     : <ChevronDown className="w-4 h-4 text-slate-400" aria-hidden="true" />
                 }
             </button>

            {open && (
                <div className="border-t border-slate-100 px-4 py-4 space-y-5 bg-slate-50/40">
                    {/* Frequency & Item Limit */}
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="frequency" className="text-xs text-slate-600 mb-1 block font-medium">How often to check for new content</Label>
                            <Select value={options.refresh_frequency} onValueChange={v => update('refresh_frequency', v)}>
                                <SelectTrigger id="frequency" className="text-sm bg-white" aria-label="Update frequency">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="5min">Every 5 minutes (high frequency)</SelectItem>
                                    <SelectItem value="15min">Every 15 minutes</SelectItem>
                                    <SelectItem value="1hour">Every hour (recommended)</SelectItem>
                                    <SelectItem value="6hours">Every 6 hours</SelectItem>
                                    <SelectItem value="daily">Once daily</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-400 mt-1">More frequent = fresher content but more API calls</p>
                        </div>
                        <div>
                            <Label htmlFor="item-limit" className="text-xs text-slate-600 mb-1 block font-medium">Maximum articles to include</Label>
                            <Select value={String(options.item_limit)} onValueChange={v => update('item_limit', Number(v))}>
                                <SelectTrigger id="item-limit" className="text-sm bg-white" aria-label="Item limit">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10 items (quick read)</SelectItem>
                                    <SelectItem value="25">25 items (balanced, recommended)</SelectItem>
                                    <SelectItem value="50">50 items (comprehensive)</SelectItem>
                                    <SelectItem value="100">100 items (full feed)</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-400 mt-1">Limits the number of articles in your feed</p>
                        </div>
                    </div>

                    {/* Include full content */}
                    <div className="flex items-center justify-between py-1">
                        <div>
                            <p className="text-sm font-medium text-slate-700" id="full-content-label">Include full content</p>
                            <p className="text-xs text-slate-400">Fetch full article body where available</p>
                        </div>
                        <Switch
                            checked={options.include_full_content}
                            onCheckedChange={v => update('include_full_content', v)}
                            aria-labelledby="full-content-label"
                            aria-label="Include full article content in feed"
                        />
                    </div>

                    {/* UTM Parameters */}
                     <div>
                         <Label htmlFor="utm-params" className="text-xs text-slate-600 mb-1 block font-medium">UTM parameters (optional)</Label>
                         <Input
                             id="utm-params"
                             className="text-sm bg-white"
                             placeholder="utm_source=mergerss&utm_medium=rss&utm_campaign=feed"
                             value={options.utm_params}
                             onChange={e => update('utm_params', e.target.value)}
                             aria-label="UTM parameters for tracking"
                             title="Add Google Analytics tracking parameters to article links"
                         />
                         <p className="text-xs text-slate-400 mt-1">
                             Automatically added to all article links. Use for Google Analytics tracking. Format: <code className="bg-slate-200 px-1 rounded text-slate-700">key1=value1&key2=value2</code>
                         </p>
                     </div>
                </div>
            )}
        </div>
    );
}