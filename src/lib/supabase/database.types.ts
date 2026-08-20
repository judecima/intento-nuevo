import type { OrganizationRole } from "@/lib/domain/roles";
import type { MaterialKind } from "@/lib/domain/materials";
import type { ProjectStatus } from "@/lib/domain/projects";
import type { OptimizationJobStatus } from "@/lib/domain/optimizations";
import type { OrderStatus } from "@/lib/domain/orders";
import type { GeneratedFileType, ProductionJobStatus } from "@/lib/domain/production";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Enums: {
      material_kind: MaterialKind;
      generated_file_type: GeneratedFileType;
      organization_role: OrganizationRole;
      optimization_job_status: OptimizationJobStatus;
      order_status: OrderStatus;
      production_job_status: ProductionJobStatus;
      project_status: ProjectStatus;
    };
    Tables: {
      board_formats: {
        Row: {
          id: string;
          organization_id: string | null;
          material_id: string;
          label: string | null;
          width: number;
          height: number;
          thickness: number;
          enabled: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          material_id: string;
          label?: string | null;
          width: number;
          height: number;
          thickness: number;
          enabled?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string | null;
          material_id?: string;
          label?: string | null;
          width?: number;
          height?: number;
          thickness?: number;
          enabled?: boolean;
          metadata?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      materials: {
        Row: {
          id: string;
          organization_id: string | null;
          external_id: string | null;
          code: string;
          code_ext: string | null;
          description: string;
          texture_id: number | null;
          type: MaterialKind;
          width: number;
          height: number;
          thickness: number;
          has_grain: boolean;
          price_m2: number;
          ref_x: number;
          ref_y: number;
          min_cut: number;
          enabled: boolean;
          image_url: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          external_id?: string | null;
          code: string;
          code_ext?: string | null;
          description: string;
          texture_id?: number | null;
          type?: MaterialKind;
          width: number;
          height: number;
          thickness: number;
          has_grain?: boolean;
          price_m2?: number;
          ref_x?: number;
          ref_y?: number;
          min_cut?: number;
          enabled?: boolean;
          image_url?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string | null;
          external_id?: string | null;
          code?: string;
          code_ext?: string | null;
          description?: string;
          texture_id?: number | null;
          type?: MaterialKind;
          width?: number;
          height?: number;
          thickness?: number;
          has_grain?: boolean;
          price_m2?: number;
          ref_x?: number;
          ref_y?: number;
          min_cut?: number;
          enabled?: boolean;
          image_url?: string | null;
          metadata?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          active: boolean;
          allow_customer_signup: boolean;
          primary_color: string;
          secondary_color: string;
          delivery_time_days: number;
          logo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          active?: boolean;
          allow_customer_signup?: boolean;
          primary_color?: string;
          secondary_color?: string;
          delivery_time_days?: number;
          logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          slug?: string;
          active?: boolean;
          allow_customer_signup?: boolean;
          primary_color?: string;
          secondary_color?: string;
          delivery_time_days?: number;
          logo_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          organization_id: string;
          user_id: string;
          role: OrganizationRole;
          active: boolean;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role: OrganizationRole;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          role?: OrganizationRole;
          active?: boolean;
        };
        Relationships: [];
      };
      platform_admins: {
        Row: {
          user_id: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          note?: string | null;
        };
        Relationships: [];
      };
      platform_settings: {
        Row: {
          id: boolean;
          legal_name: string;
          primary_color: string;
          secondary_color: string;
          logo_url: string | null;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          legal_name?: string;
          primary_color?: string;
          secondary_color?: string;
          logo_url?: string | null;
          updated_at?: string;
        };
        Update: {
          legal_name?: string;
          primary_color?: string;
          secondary_color?: string;
          logo_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          customer_id: string;
          selected_optimization_result_id: string;
          status: OrderStatus;
          submitted_at: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          approved_by: string | null;
          approved_at: string | null;
          notes_customer: string | null;
          notes_seller: string | null;
          snapshot: Json;
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          customer_id: string;
          selected_optimization_result_id: string;
          status?: OrderStatus;
          submitted_at?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          notes_customer?: string | null;
          notes_seller?: string | null;
          snapshot: Json;
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          organization_id?: string;
          project_id?: string;
          customer_id?: string;
          selected_optimization_result_id?: string;
          status?: OrderStatus;
          submitted_at?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          notes_customer?: string | null;
          notes_seller?: string | null;
          snapshot?: Json;
          updated_at?: string;
          version?: number;
        };
        Relationships: [];
      };
      order_status_history: {
        Row: {
          id: string;
          order_id: string;
          from_status: OrderStatus | null;
          to_status: OrderStatus;
          changed_by: string | null;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          from_status?: OrderStatus | null;
          to_status: OrderStatus;
          changed_by?: string | null;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          order_id?: string;
          from_status?: OrderStatus | null;
          to_status?: OrderStatus;
          changed_by?: string | null;
          comment?: string | null;
        };
        Relationships: [];
      };
      order_process_entries: {
        Row: {
          id: string;
          organization_id: string;
          order_id: string;
          invoice_number: string | null;
          remittance_number: string | null;
          remitted: boolean;
          promised_on: string | null;
          deadline_on: string | null;
          cut_completed_on: string | null;
          edgebanding_completed_on: string | null;
          delivered_at: string | null;
          edge_band_045_count: number;
          edge_band_2mm_count: number;
          process_notes: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          order_id: string;
          invoice_number?: string | null;
          remittance_number?: string | null;
          remitted?: boolean;
          promised_on?: string | null;
          deadline_on?: string | null;
          cut_completed_on?: string | null;
          edgebanding_completed_on?: string | null;
          delivered_at?: string | null;
          edge_band_045_count?: number;
          edge_band_2mm_count?: number;
          process_notes?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          order_id?: string;
          invoice_number?: string | null;
          remittance_number?: string | null;
          remitted?: boolean;
          promised_on?: string | null;
          deadline_on?: string | null;
          cut_completed_on?: string | null;
          edgebanding_completed_on?: string | null;
          delivered_at?: string | null;
          edge_band_045_count?: number;
          edge_band_2mm_count?: number;
          process_notes?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      machine_profiles: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          manufacturer: string | null;
          model: string | null;
          xml_format: string;
          kerf: number;
          min_piece_width: number;
          min_piece_height: number;
          configuration: Json;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          manufacturer?: string | null;
          model?: string | null;
          xml_format?: string;
          kerf?: number;
          min_piece_width?: number;
          min_piece_height?: number;
          configuration?: Json;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          name?: string;
          manufacturer?: string | null;
          model?: string | null;
          xml_format?: string;
          kerf?: number;
          min_piece_width?: number;
          min_piece_height?: number;
          configuration?: Json;
          active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      production_jobs: {
        Row: {
          id: string;
          order_id: string;
          assigned_operator_id: string | null;
          status: ProductionJobStatus;
          started_at: string | null;
          completed_at: string | null;
          machine_profile_id: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          assigned_operator_id?: string | null;
          status?: ProductionJobStatus;
          started_at?: string | null;
          completed_at?: string | null;
          machine_profile_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          order_id?: string;
          assigned_operator_id?: string | null;
          status?: ProductionJobStatus;
          started_at?: string | null;
          completed_at?: string | null;
          machine_profile_id?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      generated_files: {
        Row: {
          id: string;
          organization_id: string;
          order_id: string;
          optimization_result_id: string;
          type: GeneratedFileType;
          storage_bucket: string;
          storage_path: string;
          checksum: string;
          generated_by: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          order_id: string;
          optimization_result_id: string;
          type: GeneratedFileType;
          storage_bucket?: string;
          storage_path: string;
          checksum: string;
          generated_by?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          organization_id?: string;
          order_id?: string;
          optimization_result_id?: string;
          type?: GeneratedFileType;
          storage_bucket?: string;
          storage_path?: string;
          checksum?: string;
          generated_by?: string | null;
          metadata?: Json;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          organization_id: string;
          actor_id: string | null;
          entity_type: string;
          entity_id: string | null;
          action: string;
          old_data: Json | null;
          new_data: Json | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          actor_id?: string | null;
          entity_type: string;
          entity_id?: string | null;
          action: string;
          old_data?: Json | null;
          new_data?: Json | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          organization_id?: string;
          actor_id?: string | null;
          entity_type?: string;
          entity_id?: string | null;
          action?: string;
          old_data?: Json | null;
          new_data?: Json | null;
          metadata?: Json;
        };
        Relationships: [];
      };
      optimization_jobs: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          project_version: number;
          status: OptimizationJobStatus;
          algorithm_version: string;
          strategy: string;
          requested_by: string;
          started_at: string | null;
          completed_at: string | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          project_version: number;
          status?: OptimizationJobStatus;
          algorithm_version: string;
          strategy?: string;
          requested_by: string;
          started_at?: string | null;
          completed_at?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          project_id?: string;
          project_version?: number;
          status?: OptimizationJobStatus;
          algorithm_version?: string;
          strategy?: string;
          requested_by?: string;
          started_at?: string | null;
          completed_at?: string | null;
          error?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      optimization_results: {
        Row: {
          id: string;
          optimization_job_id: string;
          organization_id: string;
          project_id: string;
          project_version: number;
          board_count: number;
          piece_count: number;
          utilization_percentage: number;
          waste_percentage: number;
          commercial_remnant_area: number;
          cut_count: number;
          saw_meters: number;
          edge_band_045_meters: number;
          edge_band_2mm_meters: number;
          result_json: Json;
          validation_json: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          optimization_job_id: string;
          organization_id: string;
          project_id: string;
          project_version: number;
          board_count: number;
          piece_count: number;
          utilization_percentage: number;
          waste_percentage: number;
          commercial_remnant_area?: number;
          cut_count?: number;
          saw_meters?: number;
          edge_band_045_meters?: number;
          edge_band_2mm_meters?: number;
          result_json: Json;
          validation_json: Json;
          created_at?: string;
        };
        Update: {
          optimization_job_id?: string;
          organization_id?: string;
          project_id?: string;
          project_version?: number;
          board_count?: number;
          piece_count?: number;
          utilization_percentage?: number;
          waste_percentage?: number;
          commercial_remnant_area?: number;
          cut_count?: number;
          saw_meters?: number;
          edge_band_045_meters?: number;
          edge_band_2mm_meters?: number;
          result_json?: Json;
          validation_json?: Json;
        };
        Relationships: [];
      };
      optimization_boards: {
        Row: {
          id: string;
          optimization_result_id: string;
          board_index: number;
          width: number;
          height: number;
          placement_count: number;
          cut_count: number;
          remnant_count: number;
          raw_json: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          optimization_result_id: string;
          board_index: number;
          width: number;
          height: number;
          placement_count?: number;
          cut_count?: number;
          remnant_count?: number;
          raw_json?: Json;
          created_at?: string;
        };
        Update: {
          optimization_result_id?: string;
          board_index?: number;
          width?: number;
          height?: number;
          placement_count?: number;
          cut_count?: number;
          remnant_count?: number;
          raw_json?: Json;
        };
        Relationships: [];
      };
      optimization_pieces: {
        Row: {
          id: string;
          optimization_result_id: string;
          board_index: number;
          piece_id: string;
          reference: string;
          description: string;
          x: number;
          y: number;
          width: number;
          height: number;
          rotated: boolean;
          level: number;
          raw_json: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          optimization_result_id: string;
          board_index: number;
          piece_id: string;
          reference: string;
          description?: string;
          x: number;
          y: number;
          width: number;
          height: number;
          rotated?: boolean;
          level?: number;
          raw_json?: Json;
          created_at?: string;
        };
        Update: {
          optimization_result_id?: string;
          board_index?: number;
          piece_id?: string;
          reference?: string;
          description?: string;
          x?: number;
          y?: number;
          width?: number;
          height?: number;
          rotated?: boolean;
          level?: number;
          raw_json?: Json;
        };
        Relationships: [];
      };
      optimization_cuts: {
        Row: {
          id: string;
          optimization_result_id: string;
          board_index: number;
          x1: number;
          y1: number;
          x2: number;
          y2: number;
          level: number;
          length: number;
          terminal: boolean;
          raw_json: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          optimization_result_id: string;
          board_index: number;
          x1: number;
          y1: number;
          x2: number;
          y2: number;
          level?: number;
          length: number;
          terminal?: boolean;
          raw_json?: Json;
          created_at?: string;
        };
        Update: {
          optimization_result_id?: string;
          board_index?: number;
          x1?: number;
          y1?: number;
          x2?: number;
          y2?: number;
          level?: number;
          length?: number;
          terminal?: boolean;
          raw_json?: Json;
        };
        Relationships: [];
      };
      optimization_remnants: {
        Row: {
          id: string;
          optimization_result_id: string;
          board_index: number;
          x: number;
          y: number;
          width: number;
          height: number;
          area: number;
          commercial: boolean;
          raw_json: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          optimization_result_id: string;
          board_index: number;
          x: number;
          y: number;
          width: number;
          height: number;
          area: number;
          commercial?: boolean;
          raw_json?: Json;
          created_at?: string;
        };
        Update: {
          optimization_result_id?: string;
          board_index?: number;
          x?: number;
          y?: number;
          width?: number;
          height?: number;
          area?: number;
          commercial?: boolean;
          raw_json?: Json;
        };
        Relationships: [];
      };
      project_items: {
        Row: {
          id: string;
          project_id: string;
          reference: string;
          description: string | null;
          quantity: number;
          width: number;
          height: number;
          grain: boolean;
          can_rotate: boolean;
          edge_top: boolean;
          edge_bottom: boolean;
          edge_left: boolean;
          edge_right: boolean;
          edge_type: "none" | "thin" | "thick" | "both";
          metadata: Json;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          reference: string;
          description?: string | null;
          quantity?: number;
          width: number;
          height: number;
          grain?: boolean;
          can_rotate?: boolean;
          edge_top?: boolean;
          edge_bottom?: boolean;
          edge_left?: boolean;
          edge_right?: boolean;
          edge_type?: "none" | "thin" | "thick" | "both";
          metadata?: Json;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          reference?: string;
          description?: string | null;
          quantity?: number;
          width?: number;
          height?: number;
          grain?: boolean;
          can_rotate?: boolean;
          edge_top?: boolean;
          edge_bottom?: boolean;
          edge_left?: boolean;
          edge_right?: boolean;
          edge_type?: "none" | "thin" | "thick" | "both";
          metadata?: Json;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          organization_id: string;
          owner_id: string;
          created_by?: string | null;
          name: string;
          description: string | null;
          status: ProjectStatus;
          material_id: string;
          board_width: number;
          board_height: number;
          board_thickness: number;
          kerf: number;
          trim_x: number;
          trim_y: number;
          min_remnant: number;
          min_cut_size: number;
          grain_enabled: boolean;
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          owner_id: string;
          created_by?: string | null;
          name: string;
          description?: string | null;
          status?: ProjectStatus;
          material_id: string;
          board_width: number;
          board_height: number;
          board_thickness: number;
          kerf?: number;
          trim_x?: number;
          trim_y?: number;
          min_remnant?: number;
          min_cut_size?: number;
          grain_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          name?: string;
          description?: string | null;
          status?: ProjectStatus;
          material_id?: string;
          board_width?: number;
          board_height?: number;
          board_thickness?: number;
          kerf?: number;
          trim_x?: number;
          trim_y?: number;
          min_remnant?: number;
          min_cut_size?: number;
          grain_enabled?: boolean;
          updated_at?: string;
          version?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      organization_public_info: {
        Args: {
          target_slug: string;
        };
        Returns: Array<{
          id: string;
          name: string;
          slug: string;
          active: boolean;
          allow_customer_signup: boolean;
          primary_color: string;
          secondary_color: string;
          logo_url: string | null;
        }>;
      };
      join_organization_as_customer: {
        Args: {
          target_slug: string;
        };
        Returns: string;
      };
      can_edit_project: {
        Args: {
          target_project_id: string;
        };
        Returns: boolean;
      };
      approve_order: {
        Args: {
          target_order_id: string;
          expected_order_version: number;
          transition_comment?: string | null;
        };
        Returns: string;
      };
      build_order_snapshot: {
        Args: {
          target_project_id: string;
          target_optimization_result_id: string;
        };
        Returns: Json;
      };
      can_read_order: {
        Args: {
          target_order_id: string;
        };
        Returns: boolean;
      };
      can_update_order_process: {
        Args: {
          target_order_id: string;
        };
        Returns: boolean;
      };
      can_manage_production_order: {
        Args: {
          target_order_id: string;
        };
        Returns: boolean;
      };
      can_read_generated_file: {
        Args: {
          target_file_id: string;
        };
        Returns: boolean;
      };
      can_read_project: {
        Args: {
          target_project_id: string;
        };
        Returns: boolean;
      };
      can_read_optimization_result: {
        Args: {
          target_result_id: string;
        };
        Returns: boolean;
      };
      can_write_optimization_result: {
        Args: {
          target_result_id: string;
        };
        Returns: boolean;
      };
      admin_create_machine_profile: {
        Args: {
          target_organization_id: string;
          profile_name: string;
          profile_manufacturer?: string | null;
          profile_model?: string | null;
          profile_xml_format?: string;
          profile_kerf?: number;
          profile_min_piece_width?: number;
          profile_min_piece_height?: number;
          profile_configuration?: Json;
          profile_active?: boolean;
        };
        Returns: string;
      };
      admin_upsert_organization_member: {
        Args: {
          target_organization_id: string;
          target_user_id: string;
          new_role: OrganizationRole;
          new_active?: boolean;
          change_comment?: string | null;
        };
        Returns: string;
      };
      admin_update_machine_profile: {
        Args: {
          target_profile_id: string;
          profile_name: string;
          profile_manufacturer?: string | null;
          profile_model?: string | null;
          profile_xml_format?: string;
          profile_kerf?: number;
          profile_min_piece_width?: number;
          profile_min_piece_height?: number;
          profile_configuration?: Json;
          profile_active?: boolean;
        };
        Returns: string;
      };
      admin_update_organization_member: {
        Args: {
          target_organization_id: string;
          target_user_id: string;
          new_role: OrganizationRole;
          new_active: boolean;
          change_comment?: string | null;
        };
        Returns: string;
      };
      complete_production_job: {
        Args: {
          target_order_id: string;
          expected_order_version: number;
          production_notes?: string | null;
        };
        Returns: string;
      };
      start_edgebanding_job: {
        Args: {
          target_order_id: string;
          expected_order_version: number;
          production_notes?: string | null;
        };
        Returns: string;
      };
      deliver_order: {
        Args: {
          target_order_id: string;
          expected_order_version: number;
          delivery_notes?: string | null;
          delivery_remittance_number?: string | null;
        };
        Returns: string;
      };
      request_order_changes: {
        Args: {
          target_order_id: string;
          expected_order_version: number;
          transition_comment?: string | null;
        };
        Returns: string;
      };
      upsert_order_process_entry: {
        Args: {
          target_order_id: string;
          process_invoice_number?: string | null;
          process_remittance_number?: string | null;
          process_remitted?: boolean;
          process_promised_on?: string | null;
          process_deadline_on?: string | null;
          process_cut_completed_on?: string | null;
          process_edgebanding_completed_on?: string | null;
          process_edge_band_045_count?: number;
          process_edge_band_2mm_count?: number;
          process_notes?: string | null;
        };
        Returns: string;
      };
      start_order_review: {
        Args: {
          target_order_id: string;
          expected_order_version: number;
          transition_comment?: string | null;
        };
        Returns: string;
      };
      start_production_job: {
        Args: {
          target_order_id: string;
          expected_order_version: number;
          target_machine_profile_id?: string | null;
          production_notes?: string | null;
        };
        Returns: string;
      };
      submit_project_order: {
        Args: {
          target_project_id: string;
          target_optimization_result_id: string;
          expected_project_version: number;
          notes_customer?: string | null;
        };
        Returns: string;
      };
      has_org_role: {
        Args: {
          target_organization_id: string;
          allowed_roles: OrganizationRole[];
        };
        Returns: boolean;
      };
      is_org_member: {
        Args: {
          target_organization_id: string;
        };
        Returns: boolean;
      };
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
