#version 150
//#extension GL_ARB_shading_language_420pack : require
#extension GL_ARB_explicit_attrib_location : require

#define TASK 10
#define ENABLE_OPACITY_CORRECTION 0
#define ENABLE_LIGHTNING 0
#define ENABLE_SHADOWING 0

in vec3 ray_entry_position;

layout(location = 0) out vec4 FragColor;

uniform mat4 Modelview;

uniform sampler3D volume_texture;
uniform sampler2D transfer_texture;


uniform vec3    camera_location;
uniform float   sampling_distance;
uniform float   sampling_distance_ref;
uniform float   iso_value;
uniform vec3    max_bounds;
uniform ivec3   volume_dimensions;

uniform vec3    light_position;
uniform vec3    light_ambient_color;
uniform vec3    light_diffuse_color;
uniform vec3    light_specular_color;
uniform float   light_ref_coef;


bool
inside_volume_bounds(const in vec3 sampling_position)
{
    return (   all(greaterThanEqual(sampling_position, vec3(0.0)))
            && all(lessThanEqual(sampling_position, max_bounds)));
}


float
get_sample_data(vec3 in_sampling_pos)
{
    vec3 obj_to_tex = vec3(1.0) / max_bounds;
    return texture(volume_texture, in_sampling_pos * obj_to_tex).r;

}

float
binary_search(float data_point, float prev)
{
	float left = prev;
	float right = data_point;
	float mid = (left + right) / 2;
	bool found;

	while (true) {
		if (mid == iso_value) {
			found = true;
			break;
		}
		else {
			if (mid > data_point) {
				right = mid - 1;
			}
			else {
				left = mid + 1;
			}
		}
	}

	return mid;
}

void main()
{
    /// One step trough the volume
    vec3 ray_increment      = normalize(ray_entry_position - camera_location) * sampling_distance;
    /// Position in Volume
    vec3 sampling_pos       = ray_entry_position + ray_increment; // test, increment just to be sure we are in the volume

    /// Init color of fragment
    vec4 dst = vec4(0.0, 0.0, 0.0, 0.0);

    /// check if we are inside volume
    bool inside_volume = inside_volume_bounds(sampling_pos);
    
    if (!inside_volume)
        discard;

#if TASK == 10
    vec4 max_val = vec4(0.0, 0.0, 0.0, 0.0);
    
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume) 
    {      
        // get sample
        float s = get_sample_data(sampling_pos);
                
        // apply the transfer functions to retrieve color and opacity
        vec4 color = texture(transfer_texture, vec2(s, s));
           
        // this is the example for maximum intensity projection
        max_val.r = max(color.r, max_val.r);
        max_val.g = max(color.g, max_val.g);
        max_val.b = max(color.b, max_val.b);
        max_val.a = max(color.a, max_val.a);
        
        // increment the ray sampling position
        sampling_pos  += ray_increment;

        // update the loop termination condition
        inside_volume  = inside_volume_bounds(sampling_pos);
    }

    dst = max_val;
#endif 
    
#if TASK == 11
	int i = 0;
    vec4 avg_val = vec4(0.0, 0.0, 0.0, 0.0);

    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume)
    {      
        // get sample
        float s = get_sample_data(sampling_pos);
                
        // apply the transfer functions to retrieve color and opacity
        vec4 color = texture(transfer_texture, vec2(s, s));

        // average intensity projection
        avg_val.r = avg_val.r + color.r;
        avg_val.g = avg_val.g + color.g;
        avg_val.b = avg_val.b + color.b;
        avg_val.a = avg_val.a + color.a; // not ideal, individual characteristics are lost
		i = i + 1;
        
        // increment the ray sampling position
        sampling_pos  += ray_increment;

        // update the loop termination condition
        inside_volume  = inside_volume_bounds(sampling_pos);
    }
	
    avg_val.r = avg_val.r/i;
    avg_val.g = avg_val.g/i;
    avg_val.b = avg_val.b/i;
    avg_val.a = avg_val.a/i;

	dst = avg_val;
#endif
    
#if TASK == 12 || TASK == 13

	float prev_s = 0.0;
	int iterations = 900;
	int i = 0;
	float sigma = 0.00000001;
	float left, right, mid;
	float step = 0.0001;
	bool found = false;
	vec4 first_hit = vec4(0.0, 0.0, 0.0, 1.0);
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume)
    {
        // get sample
		float s = get_sample_data(sampling_pos);

		// apply the transfer functions to retrieve color and opacity
		vec4 color = texture(transfer_texture, vec2(s, s));


		if ((s > iso_value) && (prev_s < iso_value)) {
			first_hit = color;
		

#if TASK == 13 // Binary Search
		
		//binary_search(s, float prev_s);

			left = prev_s;
			right = s;

			i = 0;
			found = false;

			while (i < iterations && !found && left<=right) {
				
				//first_hit = vec4(1.0, 0.0, 1.0, 1.0);
				mid = left + ((right - left)/2);

				if ((mid - iso_value) < sigma) {
					found = true;
					//first_hit = texture(transfer_texture, vec2(mid, mid));
					//first_hit = vec4(0.0, 1.0, 0.0, 1.0);
					break;
				} else {
					if (mid > iso_value) {
						right = mid - step;
					}
					else {
						left = mid + step;
					}
				}
				i = i + 1;
			}
			first_hit = texture(transfer_texture, vec2(mid, mid));

			

#endif
			break;
		}
#if ENABLE_LIGHTNING == 1 // Add Shading
        IMPLEMENTLIGHT;
#if ENABLE_SHADOWING == 1 // Add Shadows
        IMPLEMENTSHADOW;
#endif
#endif
		prev_s = s;
		//dst = vec4(light_diffuse_color, 1.0);

		// increment the ray sampling position
		sampling_pos += ray_increment;

        // update the loop termination condition
        inside_volume = inside_volume_bounds(sampling_pos);
    }

	dst = first_hit;
#endif 

#if TASK == 31
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume)
    {
        // get sample
#if ENABLE_OPACITY_CORRECTION == 1 // Opacity Correction
        IMPLEMENT;
#else
        float s = get_sample_data(sampling_pos);
#endif
        // dummy code
        dst = vec4(light_specular_color, 1.0);

        // increment the ray sampling position
        sampling_pos += ray_increment;

#if ENABLE_LIGHTNING == 1 // Add Shading
        IMPLEMENT;
#endif

        // update the loop termination condition
        inside_volume = inside_volume_bounds(sampling_pos);
    }
#endif 

    // return the calculated color value
    FragColor = dst;
}

