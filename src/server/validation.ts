import { z } from 'zod';

export const updateLocaleSchema = z.object({
  locale: z.enum(['en', 'ar']),
});

export const createOrgSchema = z.object({
  name: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(80),
  businessType: z.enum(['agency', 'consultant', 'business', 'ecommerce', 'other']),
  billingCountryCode: z.string().trim().length(2).default('EG'),
});

export const marketTargetInputSchema = z.object({
  countryCode: z.string().trim().length(2),
  languageCode: z.string().trim().min(2).max(5),
  searchEngineCode: z.enum(['google', 'yandex', 'bing']),
  device: z.enum(['desktop', 'mobile', 'both']).default('both'),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(2, 'Project name is required').max(100),
  websiteUrl: z.string().trim().min(3, 'Website URL is required').max(255),
  businessDescription: z.string().trim().max(1000).default(''),
  industry: z.string().trim().max(120).default(''),
  targetAudience: z.string().trim().max(300).default(''),
  primaryCountryCode: z.string().trim().length(2).default('EG'),
  businessGoals: z.string().trim().max(500).default(''),
  marketTargets: z.array(marketTargetInputSchema).min(1, 'Select at least one target market'),
  competitors: z
    .array(
      z.object({
        domain: z.string().trim().min(3).max(150),
        label: z.string().trim().max(80).optional(),
      })
    )
    .max(20)
    .default([]),
});

export const onboardingSchema = z.object({
  organization: createOrgSchema,
  project: createProjectSchema,
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  role: z.enum(['admin', 'analyst', 'viewer']),
});

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(16, 'Valid invitation token is required').max(256),
});

export const addCompetitorSchema = z.object({
  domain: z.string().trim().min(3, 'Competitor domain is required').max(150),
  label: z.string().trim().max(80).default(''),
});

export const contactLeadSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(100),
  email: z.string().trim().email('Valid email is required'),
  company: z.string().trim().max(120).default(''),
  countryCode: z.string().trim().length(2).default('EG'),
  message: z.string().trim().min(10, 'Please include at least 10 characters').max(2000),
});
