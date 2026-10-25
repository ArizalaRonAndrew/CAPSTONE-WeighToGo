CREATE OR REPLACE FUNCTION public.trend_counts(
  p_start date,
  p_end date,
  p_indicator text,
  p_barangay text,
  p_submitted_only boolean
)
RETURNS TABLE(period text, status text, total bigint)
LANGUAGE sql
STABLE
AS $function$
  WITH scoped AS (
    SELECT
      a.child_id,
      a.date_measured,
      a.id,
      (CASE p_indicator
        WHEN 'wfa' THEN a.wfa_status
        WHEN 'hfa' THEN a.hfa_status
        WHEN 'wfl_h' THEN a.wfl_h_status
      END)::text AS status,
      CASE
        WHEN EXTRACT(MONTH FROM a.date_measured) BETWEEN 1 AND 3
          THEN TO_CHAR(a.date_measured, 'YYYY') || '-Q1'
        ELSE TO_CHAR(a.date_measured, 'YYYY-MM')
      END AS period,
      a.submission_status
    FROM public.tbl_assessments AS a
    JOIN public.tbl_children AS c ON c.id = a.child_id
    WHERE a.status = 'active'
      AND a.date_measured >= p_start
      AND a.date_measured < p_end
      AND (p_barangay IS NULL OR c.barangay = p_barangay)
  ),
  marked AS (
    SELECT
      scoped.*,
      BOOL_OR(submission_status = 'submitted')
        OVER (PARTITION BY child_id, period) AS has_submitted
    FROM scoped
  ),
  deduped AS (
    SELECT DISTINCT ON (child_id, period)
      child_id,
      period,
      status,
      has_submitted
    FROM marked
    ORDER BY child_id, period, date_measured, id
  )
  SELECT period, status, COUNT(*)::bigint AS total
  FROM deduped
  WHERE status IS NOT NULL
    AND (NOT p_submitted_only OR has_submitted)
  GROUP BY period, status
  ORDER BY period, status;
$function$;
