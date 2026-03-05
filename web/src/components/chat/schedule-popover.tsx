"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Clock, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface SchedulePopoverProps {
  onSchedule: (date: Date) => void;
  children: React.ReactNode;
}

const QUICK_OPTIONS = [
  { label: "In 1 hour", getDate: () => addHours(new Date(), 1) },
  { label: "In 3 hours", getDate: () => addHours(new Date(), 3) },
  { label: "Tomorrow 9am", getDate: () => tomorrowAt(9, 0) },
  { label: "Tomorrow 2pm", getDate: () => tomorrowAt(14, 0) },
] as const;

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function tomorrowAt(hour: number, minute: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const DAYS_OF_WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const days: Array<{ day: number; inMonth: boolean; date: Date }> = [];

  // Previous month padding
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    days.push({ day, inMonth: false, date: new Date(year, month - 1, day) });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ day: d, inMonth: true, date: new Date(year, month, d) });
  }

  // Next month padding
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push({ day: d, inMonth: false, date: new Date(year, month + 1, d) });
  }

  return days;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isPast(date: Date): boolean {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d < now;
}

export function SchedulePopover({ onSchedule, children }: SchedulePopoverProps) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [hour, setHour] = useState("09");
  const [minute, setMinute] = useState("00");
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const calendarDays = useMemo(
    () => getCalendarDays(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const today = useMemo(() => new Date(), []);

  const handleQuickOption = useCallback(
    (getDate: () => Date) => {
      onSchedule(getDate());
      setOpen(false);
      setShowCustom(false);
    },
    [onSchedule]
  );

  const handleCustomSchedule = useCallback(() => {
    if (!selectedDate) return;
    const d = new Date(selectedDate);
    d.setHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
    if (d <= new Date()) return;
    onSchedule(d);
    setOpen(false);
    setShowCustom(false);
    setSelectedDate(null);
  }, [selectedDate, hour, minute, onSchedule]);

  const navigateMonth = useCallback(
    (delta: number) => {
      let m = viewMonth + delta;
      let y = viewYear;
      if (m < 0) {
        m = 11;
        y -= 1;
      } else if (m > 11) {
        m = 0;
        y += 1;
      }
      setViewMonth(m);
      setViewYear(y);
    },
    [viewMonth, viewYear]
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setShowCustom(false);
      setSelectedDate(null);
    }
  }, []);

  const isScheduleDisabled = !selectedDate;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-72 border-border bg-card p-0"
      >
        {!showCustom ? (
          <QuickOptionsView
            onQuick={handleQuickOption}
            onCustom={() => setShowCustom(true)}
          />
        ) : (
          <CustomDateView
            viewYear={viewYear}
            viewMonth={viewMonth}
            calendarDays={calendarDays}
            today={today}
            selectedDate={selectedDate}
            hour={hour}
            minute={minute}
            onSelectDate={setSelectedDate}
            onHourChange={setHour}
            onMinuteChange={setMinute}
            onNavigateMonth={navigateMonth}
            onBack={() => setShowCustom(false)}
            onSchedule={handleCustomSchedule}
            disabled={isScheduleDisabled}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Quick Options Sub-view ───────────────────────────────
function QuickOptionsView({
  onQuick,
  onCustom,
}: {
  onQuick: (getDate: () => Date) => void;
  onCustom: () => void;
}) {
  return (
    <div className="p-1">
      <div className="px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Schedule send
        </p>
      </div>
      {QUICK_OPTIONS.map((opt) => (
        <button
          key={opt.label}
          onClick={() => onQuick(opt.getDate)}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
        >
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{opt.label}</span>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {formatPreview(opt.getDate())}
          </span>
        </button>
      ))}
      <div className="mx-3 my-1 h-px bg-border" />
      <button
        onClick={onCustom}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
      >
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
        <span>Custom...</span>
      </button>
    </div>
  );
}

function formatPreview(date: Date): string {
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Custom Date Sub-view ─────────────────────────────────
function CustomDateView({
  viewYear,
  viewMonth,
  calendarDays,
  today,
  selectedDate,
  hour,
  minute,
  onSelectDate,
  onHourChange,
  onMinuteChange,
  onNavigateMonth,
  onBack,
  onSchedule,
  disabled,
}: {
  viewYear: number;
  viewMonth: number;
  calendarDays: Array<{ day: number; inMonth: boolean; date: Date }>;
  today: Date;
  selectedDate: Date | null;
  hour: string;
  minute: string;
  onSelectDate: (d: Date) => void;
  onHourChange: (h: string) => void;
  onMinuteChange: (m: string) => void;
  onNavigateMonth: (delta: number) => void;
  onBack: () => void;
  onSchedule: () => void;
  disabled: boolean;
}) {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3 w-3" />
          Back
        </button>
        <span className="text-xs font-medium text-foreground">
          Pick date &amp; time
        </span>
        <div className="w-10" />
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <button
          onClick={() => onNavigateMonth(-1)}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs font-medium text-foreground">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button
          onClick={() => onNavigateMonth(1)}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="px-2 pb-1">
        <div className="grid grid-cols-7 gap-0">
          {DAYS_OF_WEEK.map((d) => (
            <div
              key={d}
              className="flex h-7 items-center justify-center text-[10px] font-medium text-muted-foreground"
            >
              {d}
            </div>
          ))}
          {calendarDays.map((cell, i) => {
            const isToday = isSameDay(cell.date, today);
            const isSelected =
              selectedDate !== null && isSameDay(cell.date, selectedDate);
            const past = isPast(cell.date) && !isToday;
            return (
              <button
                key={i}
                disabled={past || !cell.inMonth}
                onClick={() => onSelectDate(cell.date)}
                className={cn(
                  "flex h-7 w-full items-center justify-center rounded text-xs transition-colors",
                  !cell.inMonth && "text-muted-foreground/30",
                  cell.inMonth && !past && "text-foreground hover:bg-accent",
                  past && cell.inMonth && "text-muted-foreground/40 cursor-not-allowed",
                  isToday && !isSelected && "font-bold text-cyan-glow",
                  isSelected &&
                    "bg-cyan-glow text-primary-foreground font-semibold hover:bg-cyan-glow/90"
                )}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time picker */}
      <div className="border-t border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-muted-foreground">Time:</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={23}
              value={hour}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                if (v === "" || (parseInt(v) >= 0 && parseInt(v) <= 23)) {
                  onHourChange(v.padStart(2, "0").slice(-2));
                }
              }}
              className="h-7 w-10 rounded border border-border bg-background text-center text-xs text-foreground outline-none focus:border-cyan-glow/50"
            />
            <span className="text-xs text-muted-foreground">:</span>
            <input
              type="number"
              min={0}
              max={59}
              value={minute}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                if (v === "" || (parseInt(v) >= 0 && parseInt(v) <= 59)) {
                  onMinuteChange(v.padStart(2, "0").slice(-2));
                }
              }}
              className="h-7 w-10 rounded border border-border bg-background text-center text-xs text-foreground outline-none focus:border-cyan-glow/50"
            />
          </div>
        </div>
      </div>

      {/* Confirm */}
      <div className="border-t border-border p-2">
        <Button
          onClick={onSchedule}
          disabled={disabled}
          className="w-full bg-cyan-glow text-primary-foreground hover:bg-cyan-glow/90 shadow-[0_0_12px_rgba(0,212,255,0.2)]"
          size="sm"
        >
          <Clock className="mr-2 h-3.5 w-3.5" />
          Schedule
        </Button>
      </div>
    </div>
  );
}
