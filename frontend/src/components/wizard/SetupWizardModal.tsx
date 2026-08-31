import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { BusinessSettings, IndustryPreset, CustomField } from '../../types';
import {
  Smartphone,
  Shirt,
  Pill,
  ShoppingCart,
  Wrench,
  Store,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Eye,
  Search,
  Printer,
  Sliders,
  Settings2,
  Building,
} from 'lucide-react';
import { Button } from '../common/Button';
import { Input } from '../common/Input';

interface SetupWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: BusinessSettings | null;
  onSetupComplete: (updatedSettings: BusinessSettings) => void;
}

export const SetupWizardModal: React.FC<SetupWizardModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onSetupComplete,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [presets, setPresets] = useState<IndustryPreset[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [businessName, setBusinessName] = useState(currentSettings?.business_name || 'My Business');
  const [phone, setPhone] = useState(currentSettings?.phone || '');
  const [address, setAddress] = useState(currentSettings?.address || '');
  const [currency, setCurrency] = useState(currentSettings?.currency || 'Rs.');
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>(
    currentSettings?.industry_preset || 'mobile_electronics'
  );

  // Dynamic schema fields being edited
  const [editableFields, setEditableFields] = useState<Array<Partial<CustomField>>>([]);

  // New field addition form
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<string>('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');
  const [newFieldShowTable, setNewFieldShowTable] = useState(true);
  const [newFieldShowPos, setNewFieldShowPos] = useState(true);
  const [newFieldShowReceipt, setNewFieldShowReceipt] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPresets();
      if (currentSettings) {
        setBusinessName(currentSettings.business_name || 'My Business');
        setPhone(currentSettings.phone || '');
        setAddress(currentSettings.address || '');
        setCurrency(currentSettings.currency || 'Rs.');
        if (currentSettings.industry_preset) {
          setSelectedPresetKey(currentSettings.industry_preset);
        }
      }
    }
  }, [isOpen, currentSettings]);

  const loadPresets = async () => {
    try {
      setLoadingPresets(true);
      const res = await api.getPresets();
      setPresets(res || []);

      // If editable fields are empty, load selected preset fields
      const targetPreset = (res || []).find((p) => p.key === selectedPresetKey) || res[0];
      if (targetPreset) {
        setEditableFields(
          targetPreset.fields.map((f, i) => ({
            ...f,
            display_order: i + 1,
            is_active: true,
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load presets:', err);
    } finally {
      setLoadingPresets(false);
    }
  };

  const handleSelectPreset = (preset: IndustryPreset) => {
    setSelectedPresetKey(preset.key);
    setEditableFields(
      preset.fields.map((f, i) => ({
        ...f,
        display_order: i + 1,
        is_active: true,
      }))
    );
  };

  const handleAddField = () => {
    if (!newFieldName.trim()) return;
    const newField: Partial<CustomField> = {
      name: newFieldName.trim(),
      field_type: newFieldType,
      options: newFieldType === 'select' ? newFieldOptions.trim() || undefined : undefined,
      is_required: false,
      show_in_table: newFieldShowTable,
      show_in_pos: newFieldShowPos,
      show_in_receipt: newFieldShowReceipt,
      display_order: editableFields.length + 1,
      is_active: true,
    };
    setEditableFields([...editableFields, newField]);
    setNewFieldName('');
    setNewFieldOptions('');
    setNewFieldType('text');
  };

  const handleRemoveField = (index: number) => {
    setEditableFields(editableFields.filter((_, i) => i !== index));
  };

  const handleToggleFieldProp = (
    index: number,
    prop: 'show_in_table' | 'show_in_pos' | 'show_in_receipt' | 'is_required'
  ) => {
    const updated = [...editableFields];
    updated[index] = {
      ...updated[index],
      [prop]: !updated[index][prop],
    };
    setEditableFields(updated);
  };

  const handleSaveSetup = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const payload = {
        preset_key: selectedPresetKey,
        business_name: businessName.trim() || 'My Business',
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        currency: currency.trim() || 'Rs.',
        custom_fields: editableFields,
      };

      const res = await api.applyPreset(payload);
      onSetupComplete(res);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.detail || 'Failed to complete business setup. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const getPresetIcon = (iconName: string) => {
    switch (iconName) {
      case 'Smartphone':
        return <Smartphone className="h-6 w-6 text-blue-600" />;
      case 'Shirt':
        return <Shirt className="h-6 w-6 text-purple-600" />;
      case 'Pill':
        return <Pill className="h-6 w-6 text-emerald-600" />;
      case 'ShoppingCart':
        return <ShoppingCart className="h-6 w-6 text-amber-600" />;
      case 'Wrench':
        return <Wrench className="h-6 w-6 text-indigo-600" />;
      default:
        return <Store className="h-6 w-6 text-slate-700" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-8 max-h-[90vh]">
        {/* Top Header Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 p-6 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/20 rounded-2xl border border-emerald-400/30">
              <Sparkles className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Business Setup & Schema Wizard</h2>
              <p className="text-xs text-slate-300">
                Tailor product columns, table attributes, and POS search for your business.
              </p>
            </div>
          </div>

          {/* Step Progress Pills */}
          <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-2xl border border-white/10 text-xs font-bold">
            <span className={step === 1 ? 'text-emerald-400' : 'text-slate-400'}>1. Profile</span>
            <span className="text-slate-500">→</span>
            <span className={step === 2 ? 'text-emerald-400' : 'text-slate-400'}>2. Business Type</span>
            <span className="text-slate-500">→</span>
            <span className={step === 3 ? 'text-emerald-400' : 'text-slate-400'}>3. Table Columns</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
              {errorMsg}
            </div>
          )}

          {/* STEP 1: Business Profile */}
          {step === 1 && (
            <div className="space-y-5 animate-fade-in">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-900">Step 1: Your Business Profile</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Set your shop name and currency. You can change these anytime in Settings.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Business / Shop Name *"
                  placeholder="e.g. Apex Mobile Store, Al-Madina Garments"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                />

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Currency Symbol *
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="Rs.">Rs. (Pakistani / Indian Rupee)</option>
                    <option value="$">$ (USD / Dollar)</option>
                    <option value="AED">AED (UAE Dirham)</option>
                    <option value="SAR">SAR (Saudi Riyal)</option>
                    <option value="€">€ (Euro)</option>
                    <option value="£">£ (British Pound)</option>
                    <option value="OMR">OMR (Omani Rial)</option>
                    <option value="KWD">KWD (Kuwaiti Dinar)</option>
                    <option value="BDT">BDT (Bangladeshi Taka)</option>
                  </select>
                </div>

                <Input
                  label="Phone Number (Optional)"
                  placeholder="e.g. 0300-1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />

                <Input
                  label="Shop Address / City (Optional)"
                  placeholder="e.g. Shop #12, Hafeez Center, Lahore"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* STEP 2: Industry Preset Selection */}
          {step === 2 && (
            <div className="space-y-5 animate-fade-in">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-900">Step 2: Choose Your Business Type</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pick a preset to automatically configure the right attributes (Brand, Size, IMEI, Expiry, etc.).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {presets.map((preset) => {
                  const isSelected = selectedPresetKey === preset.key;
                  return (
                    <div
                      key={preset.key}
                      onClick={() => handleSelectPreset(preset)}
                      className={`p-5 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/50 shadow-md ring-2 ring-emerald-500/20'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="p-2.5 rounded-xl bg-white border border-slate-100 shadow-sm">
                            {getPresetIcon(preset.icon)}
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 fill-emerald-100" />
                          )}
                        </div>

                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">{preset.title}</h4>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                            {preset.description}
                          </p>
                        </div>
                      </div>

                      {/* Included fields tags */}
                      <div className="pt-3 mt-3 border-t border-slate-100/80">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                          Includes:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {preset.fields.slice(0, 4).map((f, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] bg-white border border-slate-200 text-slate-700 font-medium px-2 py-0.5 rounded-md"
                            >
                              {f.name}
                            </span>
                          ))}
                          {preset.fields.length > 4 && (
                            <span className="text-[10px] text-slate-400 font-semibold px-1 py-0.5">
                              +{preset.fields.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: Customize Table Schema & Columns */}
          {step === 3 && (
            <div className="space-y-5 animate-fade-in">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Step 3: Customize Your Table Columns & Schema
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Toggle which attributes appear as table columns, in POS search, or on receipts.
                  </p>
                </div>
                <span className="text-xs font-bold px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl">
                  {editableFields.length} Attribute(s)
                </span>
              </div>

              {/* Active Attributes Table */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-12 gap-2 p-3 bg-slate-100/80 border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-500">
                  <div className="col-span-4">Attribute Name & Type</div>
                  <div className="col-span-4">Options (if Dropdown)</div>
                  <div className="col-span-3 text-center">Visibility & Rules</div>
                  <div className="col-span-1 text-right">Action</div>
                </div>

                <div className="divide-y divide-slate-200/60 max-h-72 overflow-y-auto">
                  {editableFields.map((field, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 p-3 bg-white hover:bg-slate-50/70 items-center text-xs"
                    >
                      {/* Name & Type */}
                      <div className="col-span-4">
                        <div className="font-bold text-slate-900">{field.name}</div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">
                          Type: {field.field_type}
                        </span>
                      </div>

                      {/* Dropdown Options */}
                      <div className="col-span-4 text-slate-600 truncate">
                        {field.field_type === 'select' ? (
                          <span
                            className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md text-[11px] font-mono block truncate"
                            title={field.options || ''}
                          >
                            {field.options || 'Custom Options'}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Free-text input</span>
                        )}
                      </div>

                      {/* Visibility Toggles */}
                      <div className="col-span-3 flex items-center justify-center gap-2">
                        {/* Table Column Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleFieldProp(idx, 'show_in_table')}
                          title="Show as Main Table Column"
                          className={`p-1.5 rounded-lg border text-[10px] font-bold flex items-center gap-1 ${
                            field.show_in_table
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-slate-100 text-slate-400 border-slate-200'
                          }`}
                        >
                          <Eye className="h-3 w-3" />
                          Table
                        </button>

                        {/* POS Search Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleFieldProp(idx, 'show_in_pos')}
                          title="Searchable in POS"
                          className={`p-1.5 rounded-lg border text-[10px] font-bold flex items-center gap-1 ${
                            field.show_in_pos
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-400 border-slate-200'
                          }`}
                        >
                          <Search className="h-3 w-3" />
                          POS
                        </button>

                        {/* Receipt Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleFieldProp(idx, 'show_in_receipt')}
                          title="Print on Thermal Receipt"
                          className={`p-1.5 rounded-lg border text-[10px] font-bold flex items-center gap-1 ${
                            field.show_in_receipt
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-slate-100 text-slate-400 border-slate-200'
                          }`}
                        >
                          <Printer className="h-3 w-3" />
                          Bill
                        </button>
                      </div>

                      {/* Remove Button */}
                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveField(idx)}
                          className="text-slate-300 hover:text-rose-600 p-1 transition"
                          title="Remove Attribute"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Custom Attribute Row */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Plus className="h-4 w-4 text-emerald-600" />
                  Add Custom Attribute / Column
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-4">
                    <Input
                      placeholder="e.g. Warranty, Fabric, Rack, Origin"
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      className="bg-white text-xs py-2"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <select
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800"
                    >
                      <option value="text">Text (Free entry)</option>
                      <option value="select">Dropdown (Options)</option>
                      <option value="date">Date (e.g. Expiry)</option>
                      <option value="number">Number</option>
                    </select>
                  </div>

                  {newFieldType === 'select' ? (
                    <div className="md:col-span-3">
                      <Input
                        placeholder="Comma-separated: S, M, L, XL"
                        value={newFieldOptions}
                        onChange={(e) => setNewFieldOptions(e.target.value)}
                        className="bg-white text-xs py-2"
                      />
                    </div>
                  ) : (
                    <div className="md:col-span-3 flex items-center gap-2 pt-2">
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newFieldShowTable}
                          onChange={(e) => setNewFieldShowTable(e.target.checked)}
                          className="rounded text-emerald-600"
                        />
                        Table Column
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newFieldShowPos}
                          onChange={(e) => setNewFieldShowPos(e.target.checked)}
                          className="rounded text-emerald-600"
                        />
                        POS Search
                      </label>
                    </div>
                  )}

                  <div className="md:col-span-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleAddField}
                      disabled={!newFieldName.trim()}
                      className="w-full font-bold"
                    >
                      + Add
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Navigation */}
        <div className="p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div>
            {step > 1 && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep((s) => (s - 1) as any)}
                className="font-bold flex items-center gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step < 3 ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  if (step === 1 && !businessName.trim()) {
                    setErrorMsg('Please enter your business name.');
                    return;
                  }
                  setErrorMsg(null);
                  setStep((s) => (s + 1) as any);
                }}
                className="font-bold flex items-center gap-1.5"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={handleSaveSetup}
                loading={submitting}
                className="font-black px-6 shadow-lg shadow-emerald-600/30 flex items-center gap-2"
              >
                <CheckCircle2 className="h-5 w-5" />
                Apply & Launch Store
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
